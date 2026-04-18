import Gio from "gi://Gio";
import GLib from "gi://GLib";
import {
    compareLogicalMonitors,
    deepCopy,
    describeDisplayConfig,
    DisplayConfig,
    DisplayState,
    LogicalMonitor,
    monitorTransformNames,
    PhysicalMonitor,
    pruneDisplayConfig,
    SavedDisplayConfig,
} from "./data.js";
import { DisplayConfigProxy } from "./dbusproxy.js";
import { mkdirWithParentsAsync } from "./mkdirs.js";
import type {
    LogicalMonitorConfigTuple,
    MonitorsConfigProperties,
    MonitorsConfigTuple,
    MonitorTransform,
    PhysicalMonitorConfigTuple,
} from "./tuples.js";


export class DisplayConfigsManager {
    #dbusProxy: DisplayConfigProxy | null = null;
    #currentState: DisplayState | null = null;
    #favourites: DisplayConfig[] = [];
    #debug: boolean;
    #stateChangedCallback: DisplayStateChangedCallback;
    // Used to give each DisplayConfig a unique ID
    #uniqueId: number = 0;
    #log: (...args: any) => void;
    #signalConnectionId: number | null = null;

    /**
     * 0 = not waiting,
     * 1 = waiting for DBus state/favourites to load,
     * 2 = Got state changed signal while waiting, state refetch required
     */
    #waiting: 0 | 1 | 2 = 0;
    get waiting(): boolean {
        return this.#waiting !== 0;
    }

    get currentSerial(): number {
        return this.#currentState?.serial || 0;
    }

    constructor(stateChangedCallback: DisplayStateChangedCallback,
        debug: boolean = false) {
        this.#stateChangedCallback = stateChangedCallback;
        this.#debug = debug;
        this.#log = debug ? (...args: any) => console.log("DP@realh:", ...args) :
            () => { };
        this.#log("Created DisplayConfigsManager");
    }

    async init() {
        this.#log("Initialising DisplayConfigsManager");
        try {
            const [state, favourites] = await Promise.all([
                this.#getInitialDBusState(),
                this.#loadFavourites(),
            ]);
            this.#currentState = state;
            this.#favourites = this.#processFavourites(favourites);
            this.#updateConfigsForState();
        } catch (e) {
            console.error("DisplayProfiles@realh: " +
                "Error initialising DisplayConfigsManager:", e);
            if (!(e instanceof Error)) {
                e = new Error(`${e}`);
            }
            this.#stateChangedCallback(e as Error);
        }
    }

    disable() {
        if (this.#signalConnectionId !== null) {
            this.#dbusProxy?.disconnectMonitorsChanged(
                this.#signalConnectionId);
            this.#signalConnectionId = null;
        }
    }

    /**
     * Adds the additional fields of DisplayConfig that are absent from
     * SavedDisplayConfig. Placeholders are used; correct values will be
     * set by #updateConfigsForState.
     */
    #processFavourites(favourites: SavedDisplayConfig[]): DisplayConfig[] {
        return favourites.map((f) => {
            return {
                id: this.getUniqueId(),
                logicalMonitors: f.logicalMonitors,
                layoutMode: f.layoutMode,
                isCurrent: false,
                isFavourite: true,
                isCompatible: true,
            };
        });
    }

    async #getInitialDBusState(): Promise<DisplayState> {
        this.#dbusProxy = await DisplayConfigProxy.getInstance();
        this.#signalConnectionId =
            this.#dbusProxy.connectMonitorsChanged(() => {
                this.#log("Got MonitorsChanged signal (waiting was " +
                    `${this.#waiting})`);
                if (this.#waiting != 0) {
                    this.#waiting = 2;
                } else {
                    this.#waiting = 1;
                    // So that the controls can be disabled while waiting.
                    this.#stateChangedCallback(this);
                }
                this.#fetchState();
            });
        return new DisplayState(await this.#dbusProxy.getCurrentStateAsync(),
            this.getUniqueId(), this.#debug);
    }

    async #fetchState(): Promise<boolean> {
        try {
            if (this.#dbusProxy === null) {
                throw new Error("DisplayProfiles@realh: No DBus proxy");
            }
            const tuple = await this.#dbusProxy.getCurrentStateAsync();
            this.#currentState = new DisplayState(
                tuple, this.getUniqueId(), this.#debug);
            this.#updateConfigsForState();
            return true;
        } catch (e) {
            if (!(e instanceof Error)) {
                e = new Error(`${e}`);
            }
            console.error("DisplayProfiles@realh: Error fetching state: ", e);
            this.#stateChangedCallback(e as Error);
            return false;
        }
    }

    async #loadFavourites(): Promise<SavedDisplayConfig[]> {
        const file = DisplayConfigsManager.configFile;
        return new Promise((resolve, _reject) => {
            file.load_contents_async(null, (_obj, res) => {
                try {
                    const [success, contents] = file.load_contents_finish(res);
                    if (!success) {
                        console.error("Unsuccessful load of " +
                            file.get_path());
                        resolve([]);
                        return;
                    }
                    if (this.#debug) {
                        console.log("Read contents of " + file.get_path());
                    }
                    const decoder = new TextDecoder();
                    const jsonStr = decoder.decode(contents);
                    const favourites = JSON.parse(jsonStr) as
                        SavedDisplayConfig[];
                    resolve(favourites);
                } catch (e) {
                    if (!(e instanceof GLib.Error) ||
                        e.domain !== Gio.io_error_quark() ||
                        e.code !== Gio.IOErrorEnum.NOT_FOUND) {
                        console.error(
                            `Failed to load/parse ${file.get_path()}:`, e);
                    } else if (this.#debug) {
                        console.log(file.get_path() + " not found");
                    }
                    resolve([]);
                }
            });
        });
    }

    #updateConfigsForState() {
        if (this.#waiting == 2) {
            console.log("DisplayProfiles@realh: Refetching state from DBus");
            this.#waiting = 1;
            this.#fetchState();
            return;
        }
        if (!this.#currentState) {
            const e = new Error("DisplayProfiles@realh: Missing current state");
            this.#stateChangedCallback(e);
            return;
        }
        this.#log("Updating configs for state:", this.#currentState.describe());
        const current = this.#currentState.getDisplayConfig();

        // current may have no monitors if we're running nested or something
        // like that.
        if (current.logicalMonitors.length === 0 ||
            current.logicalMonitors.every(
                (lm) => lm.physicalMonitors.length === 0)) {
            for (const config of this.#favourites) {
                config.isCompatible = false;
            }
        } else if (this.#identifyCurrentConfig(current)) {
            this.#currentState.isFavourite = current.isFavourite;
        } else {
            this.#favourites.unshift(current);
        }
        for (const config of this.#favourites) {
            // Make sure the primary monitor is shown first in each config.
            config.logicalMonitors.sort((a, b) => {
                if (a.primary && !b.primary) {
                    return -1;
                }
                if (!a.primary && b.primary) {
                    return 1;
                }
                return 0;
            });
            config.isCompatible =
                this.#currentState?.checkCompatibility(config) || false;
        }
        this.#waiting = 0;
        this.#stateChangedCallback(this);
    }

    /**
     * Finds the config in #favourites that matches `current`. If there is a
     * match its isCurrent field is set to true, its id is changed to match
     * `current` and its isFavourite field is copied to `current`.
     */
    #identifyCurrentConfig(current: DisplayConfig): boolean {
        current.logicalMonitors.sort(compareLogicalMonitors);
        let matched: boolean = false;
        for (const config of this.#favourites) {
            if (config.logicalMonitors.length !==
                current.logicalMonitors.length) {
                config.isCurrent = false;
                continue;
            }
            if (config.layoutMode !== current.layoutMode) {
                config.isCurrent = false;
                continue;
            }
            config.isCurrent = true;
            config.logicalMonitors.sort(compareLogicalMonitors);
            for (let i = 0; i < config.logicalMonitors.length; i++) {
                const lm1 = config.logicalMonitors[i];
                const lm2 = current.logicalMonitors[i];
                if (compareLogicalMonitors(lm1, lm2) !== 0) {
                    config.isCurrent = false;
                    break;
                }
            }
            if (!config.isCurrent) {
                continue;
            }
            current.isFavourite = config.isFavourite;
            config.id = current.id;
            matched = true;
            // Keep iterating to make sure all non-current configs have
            // isCurrent = false.
        }
        return matched;
    }

    getConfigs(): DisplayConfig[] {
        // After clicking stars, some of #favourites may have
        // isFavourite = false. We should remove them at this point because
        // this method is called when the UI is being refreshed.
        const oldLen = this.#favourites.length;
        this.#favourites = this.#favourites.filter((c) => {
            return c.isFavourite || c.isFavourite;
        });
        const confs = this.#getConfigs(true);
        this.#log(
            `Removed ${oldLen - this.#favourites.length} unstarred ` +
            `configs; now ${confs.length} including ` +
            `${this.#currentState?.isFavourite ? "" : "un"}starred current`);
        return confs;
    }

    /**
     * Gets the list of configs for saving or showing in the UI. If
     * `includeCurrent` is true, the current state is included in the list
     * whether it's a favourite or not.
     */
    #getConfigs(includeCurrent: boolean): DisplayConfig[] {
        const favs = deepCopy(this.#favourites);
        // const s = this.#debug ?
        //     `#getConfigs: ${favs.length} favourites, includeCurrent ` +
        //           `was ${includeCurrent}` : "";
        includeCurrent ||= this.#currentState?.isFavourite || false;
        // this.#log(`${s}, now ${includeCurrent}`);
        if (includeCurrent && !favs.some((c) => c.isCurrent)) {
            const current = this.#currentState?.getDisplayConfig();
            if (current) {
                favs.unshift(current);
            }
        }
        return favs;
    }

    /**
     * Updates the favourites file with current favourites.
     * @param alwaysSaveCurrent Promote current state to a favourite.
     * @returns false if it fails (never rejects).
     */
    async saveFavourites(alwaysSaveCurrent: boolean): Promise<boolean> {
        const oldLen = this.#favourites.length;
        const favs = this.#getConfigs(alwaysSaveCurrent).map(
            pruneDisplayConfig);
        this.#log(`saveFavourites: Had ${oldLen} favourites, now have ` +
            `${favs.length}`);
        const dir = DisplayConfigsManager.configDirectory;
        const file = DisplayConfigsManager.configFile;
        try {
            await mkdirWithParentsAsync(dir);
            const jsonStr = JSON.stringify(favs, null, 2);
            const encoder = new TextEncoder();
            const jsonBytes = encoder.encode(jsonStr);
            // await the new Promise so we can handle all errors in one place.
            return await new Promise((resolve, reject) => {
                file.replace_contents_async(
                    jsonBytes,
                    null,
                    false,
                    Gio.FileCreateFlags.NONE,
                    null,
                    (obj, res) => {
                        if (!obj) {
                            reject(new Error("Null object in result of " +
                                "replace_contents_async for " +
                                file.get_path()));
                            return;
                        }
                        const [success, _] = obj.replace_contents_finish(res);
                        if (success) {
                            if (this.#debug) {
                                console.log("Saved favourites to " +
                                    file.get_path());
                            }
                            resolve(true);
                        } else {
                            reject(new Error("Failed to save favourites to " +
                                file.get_path()));
                        }
                    }
                );
            });
        } catch (e) {
            console.error("Failed to save favourites to " + file.get_path(), e);
            return false;
        }
    }

    async applyConfig(config: DisplayConfig) {
        const props: MonitorsConfigProperties = {
            "layout-mode": config.layoutMode == "physical" ? 2 : 1
        };
        const monitorConfigs: LogicalMonitorConfigTuple[] =
            config.logicalMonitors.map(lm => {
                const pmConfigs: PhysicalMonitorConfigTuple[] =
                    lm.physicalMonitors.map(pm => {
                        return [
                            pm.connector,
                            pm.modeId,
                            { underscanning: pm.underscanning },
                        ];
                    });
                let transform = Math.max(
                    monitorTransformNames.indexOf(lm.transform),
                    0) as MonitorTransform;
                return [lm.x, lm.y, lm.scale, transform, lm.primary, pmConfigs];
            });
        const monsCfg: MonitorsConfigTuple = [
            this.currentSerial,
            1, // 1 = apply temporarily
            monitorConfigs,
            props,
        ];
        if (!monsCfg) {
            console.error(
                `DisplayProfiles@realh: MonitorsConfigTuple is ${monsCfg}`);
            return;
        }
        try {
            await this.#dbusProxy?.applyMonitorsConfigAsync(monsCfg,
                this.#debug);
            this.#log(`Applied config over dbus`);
        } catch (e) {
            console.error(
                "DisplayProfiles@realh: Failed to apply config over dbus", e);
        }
    }

    /**
     * Updates the favourite status of a config and saves favourites.
     */
    updateFavourite(config: DisplayConfig) {
        if (config.id === this.#currentState?.id) {
            this.#currentState.isFavourite = config.isFavourite;
        }
        for (const cfg of this.#favourites) {
            if (cfg.id === config.id) {
                cfg.isFavourite = config.isFavourite;
                return;
            }
        }
        this.saveFavourites(false).then((ok) => {
            this.#log("Saved favourites: ok " + ok);
        }).catch((e) => {
            console.error("DisplayProfiles@realh: Error saving favourites:", e);
        });
    }

    getUniqueId(): number {
        return ++this.#uniqueId;
    }

    static DISPLAY_PROFILES_ID = "display-profiles@realh";

    static get configDirectory(): Gio.File {
        return Gio.File.new_build_filenamev([
            GLib.get_user_config_dir(), this.DISPLAY_PROFILES_ID,
        ]);
    }

    static get configFile(): Gio.File {
        return Gio.File.new_build_filenamev([
            GLib.get_user_config_dir(), this.DISPLAY_PROFILES_ID,
            "favourites.json",
        ]);
    }
}
export type DisplayStateChangedCallback = (mgr: DisplayConfigsManager | Error) => void;
