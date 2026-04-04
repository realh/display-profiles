import GLib from "gi://GLib?version=2.0";

import { DisplayConfigsManager } from "../src/data.js";

const mainLoop = new GLib.MainLoop(null, false);

async function saveFavourites(mgr: DisplayConfigsManager | Error) {
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
    console.log("DisplayConfigsManager ready");
    try {
        const configs = mgr.getConfigs();
        console.log("Configs:\n" + JSON.stringify(configs, null, 2));
        await mgr.saveFavourites(true);
    } catch (e) {
        console.error(e);
    }
    mainLoop.quit();
}


async function start() {
    try {
        new DisplayConfigsManager((mgr) => { saveFavourites(mgr); }, true);
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
