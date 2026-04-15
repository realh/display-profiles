import type {
    DisplayConfigStateTuple,
    LogicalMonitorConfigTuple,
    LogicalMonitorStateTuple,
    MonitorsConfigProperties,
    MonitorsConfigTuple,
    MonitorTransform,
    PhysicalMonitorConfigTuple,
    PhysicalMonitorStateTuple,
} from "./tuples.js";

import { DisplayConfigProxy } from "./dbusproxy.js";
import Gio from "gi://Gio?version=2.0";
import GLib from "gi://GLib?version=2.0";
import { mkdirWithParentsAsync } from "./mkdirs.js";

export const monitorTransformNames = [
    "none", "90°", "180°", "270°",
    "flipped", "90° flipped", "180° flipped", "270° flipped",
];

interface ModeScales {
    preferredScale: number;
    supportedScales: number[];
}

export interface PhysicalMonitor {
    readonly connector: string;
    readonly modeId: string;
    /** undefined means underscanning is unsupported */
    readonly underscanning: boolean | undefined;
    readonly preferredMode: string;
    readonly preferredScale: number;
}

function comparePhysicalMonitors(
    pm1: PhysicalMonitor,
    pm2: PhysicalMonitor,
) {
    let cmp = pm1.connector.localeCompare(pm2.connector);
    if (cmp !== 0) {
        return cmp;
    }
    cmp = pm1.modeId.localeCompare(pm2.modeId);
    if (cmp !== 0) {
        return cmp;
    }
    if (pm1.underscanning !== pm2.underscanning) {
        return pm1.underscanning ? -1 : 1;
    }
    cmp = pm1.preferredMode.localeCompare(pm2.preferredMode);
    if (cmp !== 0) {
        return cmp;
    }
    return Math.sign(pm1.preferredScale - pm2.preferredScale);
}

interface PhysicalMonitorAndModes extends PhysicalMonitor {
    readonly supportedModes: Map<string, ModeScales>;
}

export interface LogicalMonitor {
    readonly x: number;
    readonly y: number;
    readonly scale: number;
    readonly transform: string;
    readonly primary: boolean;
    /** PhysicalMonitor.connector */
    readonly physicalMonitors: PhysicalMonitor[];
}

function deepCopy<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

function compareLogicalMonitors(
    lm1: LogicalMonitor,
    lm2: LogicalMonitor,
) {
    if (lm1.x !== lm2.x) {
        return lm1.x - lm2.x;
    }
    if (lm1.y !== lm2.y) {
        return lm1.y - lm2.y;
    }
    if (lm1.scale !== lm2.scale) {
        return lm1.scale - lm2.scale;
    }
    if (lm1.transform !== lm2.transform) {
        return lm1.transform.localeCompare(lm2.transform);
    }
    if (lm1.physicalMonitors.length !== lm2.physicalMonitors.length) {
        return lm1.physicalMonitors.length - lm2.physicalMonitors.length;
    }
    lm1.physicalMonitors.sort((a, b) => comparePhysicalMonitors(a, b));
    lm2.physicalMonitors.sort((a, b) => comparePhysicalMonitors(a, b));
    for (let i = 0; i < lm1.physicalMonitors.length; i++) {
        const pm1 = lm1.physicalMonitors[i];
        const pm2 = lm2.physicalMonitors[i];
        const cmp = comparePhysicalMonitors(pm1, pm2);
        if (cmp !== 0) {
            return cmp;
        }
    }
    return 0;
}

/**
 * The fields of DisplayConfig that are saved in favourites.json.
 */
export interface SavedDisplayConfig {
    readonly logicalMonitors: LogicalMonitor[];
    readonly layoutMode: "logical" | "physical";
}

export function describeDisplayConfig(config: SavedDisplayConfig): string {
    const lms = config.logicalMonitors.flatMap(lm => {
        const scale = `${Math.floor(lm.scale * 100)}%`;
        return lm.physicalMonitors.map(pm => {
            return `${pm.connector}: ${pm.modeId} ${scale}`;
        });
    });
    return JSON.stringify(lms, null, 2);
}

/**
 * DisplayConfig represents a single possible display configuration. id is
 * unique for each DisplayConfig. It helps identify a config when its favourite
 * status is toggled in the UI - this is because the DisplayConfig[] passed to
 * the UI is a deep copy of #allConfigs and/or #currentState.
 */
export interface DisplayConfig extends SavedDisplayConfig {
    id: number;
    isCurrent: boolean;
    isFavourite: boolean;
    isCompatible: boolean;
}

/**
 * DisplayState holds the current state read from DBus.
 */
export class DisplayState {
    #serial: number;
    get serial(): number {
        return this.#serial;
    }

    #id: number;
    get id(): number {
        return this.#id;
    }

    #physicalMonitors: Map<string, PhysicalMonitorAndModes> = new Map();
    #logicalMonitors: LogicalMonitor[];
    #layoutMode: 1 | 2 | undefined;

    get layoutMode(): "logical" | "physical" {
        return this.#layoutMode === 2 ? "physical" : "logical";
    }

    #supportsChangingLayoutMode: boolean;
    get supportsChangingLayoutMode(): boolean {
        return this.#supportsChangingLayoutMode;
    }

    isFavourite: boolean = false;

    /**
     * @param stateTuple Current state from DBus.
     * @param id Unique id for the DisplayConfig.
     */
    constructor(stateTuple: DisplayConfigStateTuple, id: number) {
        this.#serial = stateTuple[0];
        this.#id = id;
        this.#physicalMonitors = new Map();
        this.#logicalMonitors = [];
        this.#parsePhysicalMonitors(stateTuple[1]);
        this.#parseLogicalMonitors(stateTuple[2]);
        this.#layoutMode = stateTuple[3]["layout-mode"];
        this.#supportsChangingLayoutMode =
            stateTuple[3]["supports-changing-layout-mode"] === true;
    }

    #parsePhysicalMonitors(physicalMonitors: PhysicalMonitorStateTuple[]) {
        for (const pm of physicalMonitors) {
            const connector = pm[0][0];
            let modeId = "";
            let preferredMode = "";
            let preferredScale = 1.0;
            const supportedModes = new Map<string, ModeScales>;

            for (const mode of pm[1]) {
                const props = mode[6];
                if (props["is-current"]) {
                    modeId = mode[0];
                    preferredScale = mode[4];
                }
                if (props["is-preferred"]) {
                    preferredMode = mode[0];
                }
                supportedModes.set(mode[0], {
                    preferredScale: mode[4],
                    supportedScales: mode[5],
                });
            }
            let underscanning = pm[2]["is-underscanning"];
            this.#physicalMonitors.set(connector, {
                connector,
                modeId,
                underscanning,
                preferredMode,
                preferredScale,
                supportedModes
            });
        }
    }

    #parseLogicalMonitors(logicalMonitors: LogicalMonitorStateTuple[]) {
        try {
            for (const lm of logicalMonitors) {
                const phys = lm[5].map((pmIds) => {
                    const pm = this.#physicalMonitors.get(pmIds[0]);
                    if (pm === undefined) {
                        throw new Error(`Physical monitor ${pm} not found`);
                    }
                    return {
                        connector: pm.connector,
                        modeId: pm.modeId,
                        underscanning: pm.underscanning,
                        preferredMode: pm.preferredMode,
                        preferredScale: pm.preferredScale
                    };
                });
                let i = lm[3];
                if (i < 0 || i >= monitorTransformNames.length) {
                    i = 0;
                }
                this.#logicalMonitors.push({
                    x: lm[0],
                    y: lm[1],
                    scale: lm[2],
                    transform: monitorTransformNames[i],
                    primary: lm[4],
                    physicalMonitors: phys,
                });
            }
        } catch (e) {
            console.error("DisplayProfiles@realh: Invalid state from DBus: ",
                          e);
        }
    }

    /**
     * Note the result has an id of 0. It should be changed to a unique value
     * by the caller.
     */
    getDisplayConfig(): DisplayConfig {
        return {
            id: this.id,
            logicalMonitors: deepCopy(this.#logicalMonitors),
            layoutMode: this.layoutMode,
            isCurrent: true,
            isFavourite: this.isFavourite,
            isCompatible: true,
        };
    }

    checkCompatibility(config: SavedDisplayConfig): boolean {
        if (config.layoutMode !== this.layoutMode &&
            !this.supportsChangingLayoutMode)
        {
            return false;
        }
        for (const lm of config.logicalMonitors) {
            for (const pm of lm.physicalMonitors) {
                const currentPm = this.#physicalMonitors.get(pm.connector);
                if (!currentPm) {
                    return false;
                }
                if (!currentPm.supportedModes.has(pm.modeId)) {
                    return false;
                }
            }
        }
        return true;
    }

    describe(): string {
        return describeDisplayConfig(this.getDisplayConfig());
    }
}

export type DisplayStateChangedCallback =
    (mgr: DisplayConfigsManager | Error) => void;

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
                debug: boolean = false)
    {
        this.#stateChangedCallback = stateChangedCallback;
        this.#debug = debug;
        this.#log = debug ? (...args: any) =>
                console.log("DP@realh:", ...args) :
            () => {};
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
     * SavedDisplayConfig.
     */
    #processFavourites(favourites: SavedDisplayConfig[]): DisplayConfig[] {
        return favourites.map((f) => {
            return {
                id: this.getUniqueId(),
                logicalMonitors: f.logicalMonitors,
                layoutMode: f.layoutMode,
                isCurrent: false,
                isFavourite: true,
                isCompatible: this.#currentState?.checkCompatibility(f) || false,
            };
        })
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
                                this.getUniqueId());
    }

    async #fetchState(): Promise<boolean> {
        try {
            if (this.#dbusProxy === null) {
                throw new Error("DisplayProfiles@realh: No DBus proxy");
            }
            const tuple = await this.#dbusProxy.getCurrentStateAsync();
            this.#currentState = new DisplayState(tuple, this.getUniqueId());
            this.#log("Got current state:", this.#currentState.describe());
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
                        e.code !== Gio.IOErrorEnum.NOT_FOUND)
                    {
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
        if (this.#waiting !== 0) {
            console.log("DisplayProfiles@realh: Refetching state from DBus");
            this.#waiting = 1;
            this.#fetchState();
        }
        if (!this.#currentState) {
            const e = new Error("DisplayProfiles@realh: Missing current state");
            this.#stateChangedCallback(e);
            return;
        }
        const current = this.#currentState.getDisplayConfig();

        // current may have no monitors if we're running nested or something
        // like that.
        if (current.logicalMonitors.length === 0 ||
            current.logicalMonitors.every(
                (lm) => lm.physicalMonitors.length === 0))
        {
            for (const config of this.#favourites) {
                config.isCompatible = false;
            }
        } else if (this.#identifyCurrentConfig(current)) {
            this.#currentState.isFavourite = current.isFavourite;
        } else {
            this.#favourites.unshift(current);
        }
        // Make sure the primary monitor is shown first in each config.
        for (const config of this.#favourites) {
            config.logicalMonitors.sort((a, b) => {
                if (a.primary && !b.primary) {
                    return -1;
                }
                if (!a.primary && b.primary) {
                    return 1;
                }
                return 0;
            });
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
        current.logicalMonitors.sort((a, b) =>
                                     compareLogicalMonitors(a, b));
        let matched: boolean = false;
        for (const config of this.#favourites) {
            if (config.logicalMonitors.length !==
                current.logicalMonitors.length)
            {
                config.isCurrent = false;
                continue;
            }
            if (config.layoutMode !== current.layoutMode) {
                config.isCurrent = false;
                continue;
            }
            config.isCurrent = true;
            config.logicalMonitors.sort((a, b) =>
                                        compareLogicalMonitors(a, b));
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
    #getConfigs(includeCurrent: boolean):
        DisplayConfig[]
    {
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
        const favs = this.#getConfigs(alwaysSaveCurrent).map((c) => {
            return {
                logicalMonitors: c.logicalMonitors,
                layoutMode: c.layoutMode,
            }
        });
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
                )
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
                    return [ lm.x, lm.y, lm.scale, transform,
                        lm.primary, pmConfigs ];
            });
        const monsCfg: MonitorsConfigTuple = [
            this.currentSerial,
            1,  // 1 = apply temporarily
            monitorConfigs,
            props,
        ];
        if (!monsCfg) {
            console.error("DisplayProfiles@realh: MonitorsConfigTuple is " +
                         `${monsCfg}`);
            return;
        }
        try {
            await this.#dbusProxy?.applyMonitorsConfigAsync(monsCfg,
                                                            this.#debug);
            this.#log(`Applied config over dbus`);
        } catch(e) {
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
