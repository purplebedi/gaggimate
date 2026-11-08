#ifndef BEANSPLUGIN_H
#define BEANSPLUGIN_H

#include <ArduinoJson.h>
#include <LittleFS.h>
#include <display/core/Plugin.h>
#include <mutex>

constexpr size_t MAX_BEANS = 100;

/**
 * Stores the coffee bean library on the filesystem and tags finished shots
 * with the currently active bean by merging beanId/beanName into the shot's
 * notes JSON (/h/{id}.json), which the notes API round-trips verbatim.
 *
 * Storage: /beans.json — { "activeBeanId": "...", "beans": [ { ... }, ... ] }
 * Bean records are created by the web UI (it generates id/createdAt) and are
 * stored as-is, mirroring how shot notes are persisted.
 */
class BeansPlugin : public Plugin {
  public:
    BeansPlugin() = default;

    void setup(Controller *controller, PluginManager *pluginManager) override;
    void loop() override {};

    void handleRequest(JsonDocument &request, JsonDocument &response);

  private:
    bool loadStore(JsonDocument &store);
    bool saveStore(const JsonDocument &store);
    void tagShot(uint32_t shotId);

    Controller *controller = nullptr;
    PluginManager *pluginManager = nullptr;
    FS *fs = &LittleFS;
    std::mutex storeMutex;
};

extern BeansPlugin Beans;

#endif // BEANSPLUGIN_H
