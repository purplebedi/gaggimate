#ifndef BEANSPLUGIN_H
#define BEANSPLUGIN_H

#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <display/core/Plugin.h>
#include <mutex>

constexpr size_t MAX_BEANS = 100;
// A cover photo is a small cropped JPEG (the web UI targets ~20 KB). Hard cap so a bad client can't fill flash.
constexpr size_t MAX_COVER_BYTES = 64 * 1024;

/**
 * Stores the coffee bean library on the filesystem and tags finished shots
 * with the currently active bean by merging beanId/beanName into the shot's
 * notes JSON (/h/{id}.json), which the notes API round-trips verbatim.
 *
 * Storage: /beans.json — { "activeBeanId": "...", "beans": [ { ... }, ... ] }
 * Bag textures: /b/<beanId>.jpg (front) and /b/<beanId>-b.jpg (back), optional small JPEGs
 * Bean records are created by the web UI (it generates id/createdAt) and are
 * stored as-is, mirroring how shot notes are persisted.
 */
class BeansPlugin : public Plugin {
  public:
    BeansPlugin() = default;

    void setup(Controller *controller, PluginManager *pluginManager) override;
    void loop() override {};

    void handleRequest(JsonDocument &request, JsonDocument &response);

    /**
     * Registers cover-photo routes on the web server:
     *   GET  /api/beans/photo/<beanId>.jpg    front texture (static, from /b/)
     *   GET  /api/beans/photo/<beanId>-b.jpg  back texture
     *   POST /api/beans/photo?id=<beanId>&side=front|back   (raw JPEG body)
     * `photoFs` must be the same filesystem the shot history uses.
     */
    void registerRoutes(AsyncWebServer &server, FS *photoFs);

  private:
    bool loadStore(JsonDocument &store);
    bool saveStore(const JsonDocument &store);
    void tagShot(uint32_t shotId);
    void removePhoto(const String &beanId);
    size_t photoFreeSpace();

    Controller *controller = nullptr;
    PluginManager *pluginManager = nullptr;
    FS *fs = &LittleFS;
    FS *photoFs = &LittleFS;
    std::mutex storeMutex;
};

extern BeansPlugin Beans;

#endif // BEANSPLUGIN_H
