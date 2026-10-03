# Graphics: realtime rendering and games

## Observers and where to check them
- A player or viewer on presented frames: the image and its pacing.
- A replay or network peer, which needs the same state from the same input (determinism).
- An artist using the asset pipeline.

## States that usually apply
First frame, loading and streaming; a long run (memory growth, thermal); a frame-time spike, pause or background,
resize, device or swapchain loss; each GPU family or feature set and its fallback path; HDR and SDR, resolution
and scale; a shader that fails to compile or a missing asset; an empty scene and one at the entity cap; a fixed
timestep under a variable frame rate.

## Populations and how to enumerate them
Every shader variant or permutation, material, scene or level, and every device class in the support matrix.
Enumerate from the asset manifest, the permutation list and the scene list.

## Proxy → observation
| Proxy | Observation |
|---|---|
| a uniform or material value | an offscreen render or GPU capture compared to a golden with a perceptual tolerance |
| "holds 60 fps" | a frame-time trace on the weakest device with a p99 bound |
| "compiles" | the shader built for every target backend in CI |
| "deterministic" | two runs from the same input and seed compared by state hash |
| debug-overlay counts | profiler counters |
