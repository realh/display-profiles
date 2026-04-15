import GLib from "gi://GLib?version=2.0";

import { DisplayConfigsManager } from "../src/data.js";

const mainLoop = new GLib.MainLoop(null, false);

async function reapplyCurrent(mgr: DisplayConfigsManager | Error) {
    if (mgr instanceof Error) {
        console.error("Error initialising DisplayConfigsManager", mgr);
        mainLoop.quit();
        return;
    }
    if (mgr.waiting) {
        console.warn(
            "DisplayConfigsManager invoked callback before it was ready"
        );
        return;
    }
    console.log("DisplayConfigsManager ready; reapplying current mode");
    try {
        const configs = mgr.getConfigs();
        console.log("Configs:\n" + JSON.stringify(configs, null, 2));
        let current = configs.find((c) => c.isCurrent);
        if (!current) {
            console.warn("No display config matches current");
            current = configs[0];
            if (!current) {
                throw new Error("No display configs found");
            }
        }
        await mgr.applyConfig(current);
    } catch (e) {
        console.error(e);
    }
    mainLoop.quit();
}


async function start() {
    try {
        const mgr = new DisplayConfigsManager(
            (mgr) => { reapplyCurrent(mgr); },
            true);
        await mgr.init();
        console.log("DisplayConfigsManager initialisation complete");
    } catch (e) {
        console.error(e);
        mainLoop.quit();
    }
}

GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
    start();
    return GLib.SOURCE_REMOVE;
});

console.log("Starting main loop");
mainLoop.run();
