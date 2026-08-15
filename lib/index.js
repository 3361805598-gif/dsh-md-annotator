// Host half: intentionally inert.
//
// The whole feature is a client-side file viewer registered through the
// `betterSidebar` service (see lib/client.js): file bytes are fetched by the
// sidebar's own fsRead strategy and the composer draft is written through the
// client `conversation` service, so no host capability is needed. This no-op
// plugin only satisfies the bundle row loading contract.
export function apply() {}
