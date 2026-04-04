import GLib from "gi://GLib?version=2.0";

import { DisplayConfigProxy } from "../src/dbusproxy.js";
import { DisplayState } from "../src/data.js";

const mainLoop = new GLib.MainLoop(null, false);

async function showState(proxy: DisplayConfigProxy) {
    const dbusState = await proxy.getCurrentStateAsync();
    console.log("Got state");
    const dispState = new DisplayState(dbusState);
    console.log("Built DisplayState from dbus tuple");
    const dispConf = dispState.getDisplayConfig();
    console.log(JSON.stringify(dispConf));
}

async function getProxyAndShowConfig() {
    try {
        let proxy = await DisplayConfigProxy.getInstance();
        console.log("Got dbus proxy");
        await showState(proxy);
    } catch (e) {
        console.error("Execution Error:", e);
    }
    mainLoop.quit();
}

GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
    getProxyAndShowConfig();
    // Return false so the idle task only runs once
    return GLib.SOURCE_REMOVE;
});

console.log("Starting main loop");
mainLoop.run();


