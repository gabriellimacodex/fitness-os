# `@fitness-os/config`

This package is the home for shared compile-time configuration artifacts, such
as a lint preset or TypeScript preset that multiple workspace packages actually
consume.

It intentionally has no runtime environment loader or generic configuration
abstraction. Applications keep ownership of their runtime configuration until a
concrete cross-package contract exists.
