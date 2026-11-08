#include "BeansPlugin.h"

#include <SD_MMC.h>
#include <display/core/Controller.h>
#include <display/core/PluginManager.h>
#include <display/plugins/ShotHistoryPlugin.h>
#include <display/util/PsramAllocator.h>

namespace {
constexpr const char *BEANS_FILE = "/beans.json";

// Bean ids are client-generated UUIDs; only allow filename-safe characters so an id can never escape /b/.
bool validBeanId(const String &id) {
    if (id.isEmpty() || id.length() > 40) {
        return false;
    }
    for (size_t i = 0; i < id.length(); i++) {
        char ch = id[i];
        if (!isalnum(static_cast<unsigned char>(ch)) && ch != '-' && ch != '_') {
            return false;
        }
    }
    return true;
}

// State carried across the chunks of one cover upload (lives in request->_tempObject, freed by the library).
struct CoverUpload {
    int status;
    size_t total;
    size_t received;
    uint8_t data[];
};

String padId(String id, int length = 6) {
    while (id.length() < length) {
        id = "0" + id;
    }
    return id;
}
} // namespace

BeansPlugin Beans;

void BeansPlugin::setup(Controller *c, PluginManager *pm) {
    controller = c;
    pluginManager = pm;
    if (controller->isSDCard()) {
        fs = &SD_MMC;
    }
    pm->on("evt:history-shot-saved", [this](Event const &event) { tagShot(static_cast<uint32_t>(event.getInt("id"))); });
}

bool BeansPlugin::loadStore(JsonDocument &store) {
    File file = fs->open(BEANS_FILE, "r");
    if (!file) {
        return false;
    }
    DeserializationError err = deserializeJson(store, file);
    file.close();
    if (err) {
        ESP_LOGW("BeansPlugin", "Failed to parse %s: %s", BEANS_FILE, err.c_str());
        return false;
    }
    return true;
}

bool BeansPlugin::saveStore(const JsonDocument &store) {
    File file = fs->open(BEANS_FILE, FILE_WRITE);
    if (!file) {
        ESP_LOGE("BeansPlugin", "Failed to open %s for writing", BEANS_FILE);
        return false;
    }
    serializeJson(store, file);
    file.close();
    return true;
}

size_t BeansPlugin::photoFreeSpace() {
    if (photoFs == &LittleFS) {
        return LittleFS.totalBytes() - LittleFS.usedBytes();
    }
    return static_cast<size_t>(SD_MMC.totalBytes() - SD_MMC.usedBytes());
}

void BeansPlugin::removePhoto(const String &beanId) {
    if (validBeanId(beanId)) {
        photoFs->remove("/b/" + beanId + ".jpg");
    }
}

void BeansPlugin::registerRoutes(AsyncWebServer &server, FS *fsForPhotos) {
    photoFs = fsForPhotos;
    // Filenames are keyed by bean id and the UI cache-busts with ?v=, so cache hard.
    server.serveStatic("/api/beans/photo/", *photoFs, "/b/").setCacheControl("public, max-age=31536000, immutable");

    server.on(
        "/api/beans/photo", HTTP_POST,
        [](AsyncWebServerRequest *request) {
            auto *upload = static_cast<CoverUpload *>(request->_tempObject);
            int status = upload ? upload->status : 400;
            if (status == 200) {
                request->send(200, "application/json", "{\"msg\":\"Ok\"}");
            } else if (status == 413) {
                request->send(413, "text/plain", "Photo too large");
            } else if (status == 507) {
                request->send(507, "text/plain", "Not enough free space");
            } else {
                request->send(400, "text/plain", "Invalid photo upload");
            }
        },
        nullptr,
        [this](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            if (index == 0) {
                auto *upload = static_cast<CoverUpload *>(ps_malloc(sizeof(CoverUpload) + (total <= MAX_COVER_BYTES ? total : 0)));
                if (!upload) {
                    return;
                }
                upload->total = total;
                upload->received = 0;
                upload->status = 400;
                if (total > MAX_COVER_BYTES) {
                    upload->status = 413;
                } else if (!validBeanId(request->arg("id")) || total < 4) {
                    upload->status = 400;
                } else if (photoFreeSpace() < total + MIN_FREE_SPACE_BYTES + 64 * 1024) {
                    // Never eat into the space the shot history reserves for itself.
                    upload->status = 507;
                } else {
                    upload->status = 0; // accepting
                }
                request->_tempObject = upload;
            }
            auto *upload = static_cast<CoverUpload *>(request->_tempObject);
            if (!upload || upload->status != 0) {
                return;
            }
            memcpy(upload->data + index, data, len);
            upload->received += len;
            if (upload->received < upload->total) {
                return;
            }
            // Complete: must be a JPEG (SOI marker), then write atomically via a temp file.
            if (upload->data[0] != 0xFF || upload->data[1] != 0xD8) {
                upload->status = 400;
                return;
            }
            String id = request->arg("id");
            photoFs->mkdir("/b");
            String tmp = "/b/" + id + ".tmp";
            File file = photoFs->open(tmp, FILE_WRITE);
            if (!file) {
                upload->status = 400;
                return;
            }
            size_t written = file.write(upload->data, upload->total);
            file.close();
            if (written != upload->total) {
                photoFs->remove(tmp);
                upload->status = 507;
                return;
            }
            String finalPath = "/b/" + id + ".jpg";
            photoFs->remove(finalPath);
            upload->status = photoFs->rename(tmp, finalPath) ? 200 : 400;
        });
}

void BeansPlugin::handleRequest(JsonDocument &request, JsonDocument &response) {
    String type = request["tp"].as<String>();
    response["tp"] = String("res:") + type.substring(4);
    response["rid"] = request["rid"].as<String>();

    std::lock_guard<std::mutex> guard(storeMutex);
    JsonDocument store(&psramAllocator);
    loadStore(store);
    if (!store["beans"].is<JsonArray>()) {
        store["beans"].to<JsonArray>();
    }
    JsonArray beans = store["beans"].as<JsonArray>();

    if (type == "req:beans:list") {
        response["beans"] = beans;
        response["activeBeanId"] = store["activeBeanId"] | "";
        if (store["scanner"].is<JsonObject>()) {
            response["scanner"] = store["scanner"];
        }
    } else if (type == "req:beans:scanner:save") {
        store["scanner"].set(request["scanner"]);
        if (saveStore(store)) {
            response["msg"] = "Ok";
        } else {
            response["error"] = "Failed to save";
        }
    } else if (type == "req:beans:shots") {
        // Scan shot notes files for ones tagged with this bean. Notes files are
        // tiny JSON documents, so a directory sweep is cheap enough even on the
        // ESP32 and saves the client N round trips.
        String beanId = request["id"].as<String>();
        JsonArray shots = response["shots"].to<JsonArray>();
        File dir = fs->open("/h");
        if (dir && dir.isDirectory()) {
            File entry;
            while ((entry = dir.openNextFile())) {
                String name = String(entry.name());
                if (!name.endsWith(".json")) {
                    entry.close();
                    continue;
                }
                JsonDocument notes(&psramAllocator);
                DeserializationError err = deserializeJson(notes, entry);
                entry.close();
                if (!err && notes["beanId"].as<String>() == beanId) {
                    shots.add(notes);
                }
            }
            dir.close();
        }
    } else if (type == "req:beans:photo:delete") {
        removePhoto(request["id"].as<String>());
        response["msg"] = "Ok";
    } else if (type == "req:beans:stats") {
        // One directory sweep for every bean's shot count and ratings, so the shelf can show/filter by
        // rating without N separate req:beans:shots sweeps. n = tagged shots, r = rated shots, s = sum of stars.
        JsonObject stats = response["stats"].to<JsonObject>();
        File dir = fs->open("/h");
        if (dir && dir.isDirectory()) {
            File entry;
            while ((entry = dir.openNextFile())) {
                String name = String(entry.name());
                if (!name.endsWith(".json")) {
                    entry.close();
                    continue;
                }
                JsonDocument notes(&psramAllocator);
                DeserializationError err = deserializeJson(notes, entry);
                entry.close();
                if (err) {
                    continue;
                }
                String beanId = notes["beanId"] | "";
                if (beanId.isEmpty()) {
                    continue;
                }
                JsonObject s = stats[beanId].is<JsonObject>() ? stats[beanId].as<JsonObject>() : stats[beanId].to<JsonObject>();
                s["n"] = (s["n"] | 0) + 1;
                int rating = notes["rating"] | 0;
                if (rating > 0) {
                    s["r"] = (s["r"] | 0) + 1;
                    s["s"] = (s["s"] | 0) + rating;
                }
            }
            dir.close();
        }
    } else if (type == "req:beans:save") {
        String id = request["bean"]["id"].as<String>();
        String name = request["bean"]["name"].as<String>();
        if (id.isEmpty() || name.isEmpty()) {
            response["error"] = "Bean requires id and name";
            return;
        }
        bool updated = false;
        for (JsonObject bean : beans) {
            if (bean["id"].as<String>() == id) {
                bean.set(request["bean"]);
                updated = true;
                break;
            }
        }
        if (!updated) {
            if (beans.size() >= MAX_BEANS) {
                response["error"] = "Bean limit reached";
                return;
            }
            beans.add(request["bean"]);
        }
        if (saveStore(store)) {
            response["msg"] = "Ok";
        } else {
            response["error"] = "Failed to save";
        }
    } else if (type == "req:beans:delete") {
        String id = request["id"].as<String>();
        for (size_t i = 0; i < beans.size(); i++) {
            if (beans[i]["id"].as<String>() == id) {
                beans.remove(i);
                break;
            }
        }
        if (store["activeBeanId"].as<String>() == id) {
            store["activeBeanId"] = "";
        }
        removePhoto(id);
        if (saveStore(store)) {
            response["msg"] = "Ok";
        } else {
            response["error"] = "Failed to save";
        }
    } else if (type == "req:beans:set-active") {
        // Empty id clears the active bean; subsequent shots stay untagged.
        store["activeBeanId"] = request["id"].as<String>();
        if (saveStore(store)) {
            response["msg"] = "Ok";
        } else {
            response["error"] = "Failed to save";
        }
    }
}

void BeansPlugin::tagShot(uint32_t shotId) {
    std::lock_guard<std::mutex> guard(storeMutex);
    JsonDocument store(&psramAllocator);
    if (!loadStore(store)) {
        return;
    }
    String activeId = store["activeBeanId"] | "";
    if (activeId.isEmpty()) {
        return;
    }
    String beanName;
    for (JsonObject bean : store["beans"].as<JsonArray>()) {
        if (bean["id"].as<String>() == activeId) {
            beanName = bean["name"].as<String>();
            break;
        }
    }
    if (beanName.isEmpty()) {
        return;
    }

    String notesPath = "/h/" + padId(String(shotId)) + ".json";
    JsonDocument notes(&psramAllocator);
    File file = fs->open(notesPath, "r");
    if (file) {
        deserializeJson(notes, file);
        file.close();
    }
    notes["id"] = padId(String(shotId));
    notes["beanId"] = activeId;
    notes["beanName"] = beanName;
    file = fs->open(notesPath, FILE_WRITE);
    if (!file) {
        ESP_LOGE("BeansPlugin", "Failed to tag shot %u with bean %s", shotId, activeId.c_str());
        return;
    }
    serializeJson(notes, file);
    file.close();
    ESP_LOGI("BeansPlugin", "Tagged shot %u with bean %s", shotId, beanName.c_str());
}
