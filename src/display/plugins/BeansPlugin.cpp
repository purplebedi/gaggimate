#include "BeansPlugin.h"

#include <SD_MMC.h>
#include <display/core/Controller.h>
#include <display/core/PluginManager.h>
#include <display/util/PsramAllocator.h>

namespace {
constexpr const char *BEANS_FILE = "/beans.json";

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
