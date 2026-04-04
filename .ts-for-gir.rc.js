export default {
    environments: ['gjs'],
    modules: [
        'Gio-2.0',
        'GLib-2.0',
        'GObject-2.0',
        'St-17',
        'Shell-0.1',
    ],
    gnomeShell: true,
    moduleType: 'esm',
    outdir: './@types'
}
