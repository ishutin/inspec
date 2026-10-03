# Embedded: firmware and devices

## Observers and where to check them
- The device's outputs: pins, bus traffic, display.
- A host tool that reads the device.

## States that usually apply
Power loss mid-write; brown-out; a watchdog reset; an interrupt inside a critical section; flash full or worn; a
sensor out of range; clock drift.

## Populations and how to enumerate them
Every board revision, MCU variant and build configuration. Enumerate from the build matrix.

## Proxy → observation
| Proxy | Observation |
|---|---|
| a host unit test | the code on target, on a hardware-in-the-loop rig or an emulator (QEMU, Renode) |
| "fits" | the map file against the memory limits |
| a timing claim | a trace or a logic-analyser capture |
