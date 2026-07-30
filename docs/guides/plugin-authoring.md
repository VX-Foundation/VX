# Plugin Authoring

Declare the public plugin API version, capabilities, permissions, deterministic inputs, cache identity, timeout expectations, and emitted files.

Plugins execute in isolated workers. They cannot assume network, process, environment, filesystem, or arbitrary project access. Read through the mediated project API, write only to the assigned output directory, and sign the detached `vx.plugin.json` contract for trusted distribution.
