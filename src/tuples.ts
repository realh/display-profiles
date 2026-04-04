/**
 * Data structures representing display configuration as tuples for DBus.
 */


export type Properties = Record<string, any>;

/** Names are defined in data.ts */
export type MonitorTransform = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface PhysicalMonitorConfigProperties extends Properties {
    underscanning: boolean | undefined;
}

/**
 * Configuration of a single physical monitor as passed to
 * DisplayConfigProxy.ApplyMonitorsConfigAsync.
 */
export type PhysicalMonitorConfigTuple = [
    string, string,                                 // connector, mode_id
    PhysicalMonitorConfigProperties,
];

/**
 * Configuration of a single logical monitor as passed to
 * DisplayConfigProxy.ApplyMonitorsConfigAsync.
 */
export type LogicalMonitorConfigTuple = [
    number, number, number,         // x, y, scale
    MonitorTransform, boolean,      // transform, primary
    PhysicalMonitorConfigTuple[],
];

export interface MonitorsConfigProperties extends Properties {
    "layout-mode": 1 | 2 | undefined;   // 1/undef = logical, 2 = physical
}

/**
 * Complete data type passed to DisplayConfigProxy.ApplyMonitorsConfigAsync.
 */
export type MonitorsConfigTuple = [
    number,         // serial
    0 | 1 | 2,      // method: 0 = verify, 1 = temporary, 2 = persistent
    LogicalMonitorConfigTuple[],
    MonitorsConfigProperties,
];


/** connector, manufacturer, model, serial */
export type PhysicalMonitorIdsTuple = [string, string, string, string];

export interface ModeProperties extends Properties {
    "is-current": boolean | undefined;
    "is-preferred": boolean | undefined;
    "is-interlaced": boolean | undefined;
    "refresh-rate-mode": "variable" | "fixed" | undefined;
}

/**
 * id, width, height, refresh_rate, preferred_scale, supported_scales, properties
 */
export type ModeTuple =
    [string, number, number, number, number, number[], ModeProperties];

export interface PhysicalMonitorStateProperties extends Properties {
    "is-underscanning": boolean | undefined;
}

export type PhysicalMonitorStateTuple = [
    PhysicalMonitorIdsTuple,
    ModeTuple[],
    PhysicalMonitorStateProperties
];

export type LogicalMonitorStateTuple = [
    number, number,                     // x, y
    number, MonitorTransform, boolean,  // scale, transform, primary
    PhysicalMonitorIdsTuple[],
];

export interface DisplayConfigStateProperties extends Properties {
    "layout-mode": 1 | 2 | undefined;
    "supports-changing-layout-mode": boolean | undefined;
}

/**
 * Complete data type returned by DisplayConfigProxy.GetCurrentStateAsync.
 */
export type DisplayConfigStateTuple = [
    number,     // serial
    PhysicalMonitorStateTuple[],
    LogicalMonitorStateTuple[],
    DisplayConfigStateProperties
];

