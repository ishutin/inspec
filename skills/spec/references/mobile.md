# Mobile: iOS and Android apps

## Observers and where to check them
- A user on the device: gestures, VoiceOver or TalkBack, dynamic type.
- The OS: lifecycle callbacks, memory warnings, permission prompts, background limits.
- Store review.

## States that usually apply
Cold and warm start; background, killed by the OS, restored; offline or a flaky network; a permission denied or
revoked; small and large devices, rotation, split view; the minimum and latest OS; low power and thermal
pressure; no GPU work while in the background; the oldest supported GPU family.

## Populations and how to enumerate them
Every screen that shows the changed model, every device class and OS version in the support matrix. Enumerate
from the navigation graph or screen list and the matrix in the project's build settings.

## Proxy → observation
| Proxy | Observation |
|---|---|
| view-model state | a UI test or simulator capture (the simulator is not the device GPU: say so) |
| "works offline" | a run with the network cut, then restored |
| "renders on old devices" | a capture on the oldest supported GPU family |
| "survives backgrounding" | the app killed in the background and relaunched, state restored |
