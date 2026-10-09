import { useEffect, useRef, useState } from "react";
import { WindowEngine } from "./engine";
import type { Status, Mode } from "./engine";
import { pointerToUV } from "./geometry";
import "./styles.css";
import { emptyRecording } from "./recording";
const effects = [
  { name: "Psychedelic", note: "Colour, contrast and outlines", className: "psy" },
  {
    name: "Pixelation",
    note: "The image in small blocks",
    className: "pixel",
  },
  { name: "Distortion", note: "Waves in motion", className: "wave" },
  {
    name: "Terminator",
    note: "Red vision and digital crosshair",
    className: "terminator",
  },
  {
    name: "Thermal",
    note: "Brightness in thermal colours",
    className: "thermal",
  },
  { name: "Neon", note: "Electric outlines on black", className: "neon" },
  { name: "Negative", note: "Inverted colours and light", className: "negative" },
  {
    name: "Minecraft",
    note: "Blocks, raised edges and game colours",
    className: "minecraft",
  },
  {
    name: "Halftone dots",
    note: "Large dots in four colours",
    className: "halftone",
  },
  {
    name: "Ordered dithering",
    note: "Bayer pattern and reduced colours",
    className: "dither",
  },
  {
    name: "Glitch",
    note: "Analogue signal, RGB and distortion",
    className: "glitch",
  },
];
const initialStatus: Status = {
  camera: "off",
  model: "idle",
  hands: 0,
  source: "none",
  geometry: "waiting",
  error: "",
};
export default function App() {
  const host = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    engine = useRef<WindowEngine | null>(null);
  const [status, setStatus] = useState(initialStatus),
    [mode, setMode] = useState<Mode>("hands"),
    [effect, setEffect] = useState(0),
    [intensity, setIntensity] = useState(85),
    [outline, setOutline] = useState(true);
  const [recording, setRecording] = useState(emptyRecording);
  const [fullscreen, setFullscreen] = useState(false);
  const [screenError, setScreenError] = useState("");
  const recordingActive = recording.phase === "recording";
  useEffect(() => {
    const changed = () =>
      setFullscreen(document.fullscreenElement === host.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  const toggleFullscreen = async () => {
    setScreenError("");
    try {
      if (document.fullscreenElement === host.current)
        await document.exitFullscreen();
      else if (host.current?.requestFullscreen && document.fullscreenEnabled)
        await host.current.requestFullscreen();
      else
        setScreenError(
          "Fullscreen is unavailable in this browser. Try opening the application in Chrome or Edge.",
        );
    } catch {
      setScreenError(
        "The browser blocked fullscreen. Try opening the application in a Chrome or Edge window.",
      );
    }
  };
  const elapsed = `${Math.floor(recording.seconds / 60)
    .toString()
    .padStart(2, "0")}:${(recording.seconds % 60).toString().padStart(2, "0")}`;
  const dragging = useRef<number | null>(null);
  useEffect(() => {
    const e = new WindowEngine(
      host.current!,
      svg.current!,
      setStatus,
      setRecording,
    );
    engine.current = e;
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, []);
  const changeMode = (next: Mode) => {
    setMode(next);
    void engine.current?.setMode(next);
  };
  const changeEffect = (next: number) => {
    setEffect(next);
    if (engine.current) engine.current.effect = next;
  };
  const cameraActive = status.camera !== "off";
  return (
    <main className="app">
      <header>
        <a className="brand" href="./" aria-label="Window Shader, home">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M5 8 26 4 23 26 8 28Z" />
          </svg>
          <span>
            Window <strong>Shader</strong>
          </span>
        </a>
        <span className="privacy">
          <span className="privacy-icon">◇</span> Only in your browser
        </span>
      </header>
      <section className="workspace" aria-label="Window Shader studio">
        <div className="stage-column">
          <div className="stage-heading">
            <span className="eyebrow">INTERACTIVE EXPERIENCE</span>
            <span className="stage-meta">
              {status.source === "camera"
                ? "LIVE VIDEO"
                : status.source === "test"
                  ? "TEST IMAGE"
                  : "CAMERA OFF"}
            </span>
          </div>
          <div
            className={`stage ${status.source === "none" ? "is-empty" : ""}`}
            ref={host}
          >
            <div className="stage-corner top-left" />
            <div className="stage-corner bottom-right" />
            {status.source === "none" && (
              <div className="empty-state">
                <div className="window-symbol" aria-hidden="true">
                  <svg viewBox="0 0 200 150">
                    <path d="M35 30 169 19 151 126 49 117Z" />
                    {[
                      [35, 30],
                      [169, 19],
                      [151, 126],
                      [49, 117],
                    ].map(([x, y], i) => (
                      <circle key={i} cx={x} cy={y} r="5" />
                    ))}
                  </svg>
                </div>
                <h1>
                  One window.
                  <br />
                  <span>Another reality.</span>
                </h1>
                <p>
                  Frame the world with your hands.
                  <br />
                  Transform only what is inside.
                </p>
                <button
                  className="primary"
                  onClick={() => void engine.current?.startCamera()}
                  disabled={cameraActive}
                >
                  {status.camera === "requesting"
                    ? "Requesting access…"
                    : "Start"}{" "}
                  <span aria-hidden="true">↗</span>
                </button>
                <button
                  className="text-button"
                  onClick={() => changeMode("simulation")}
                >
                  Try simulation <span aria-hidden="true">→</span>
                </button>
              </div>
            )}
            <svg
              ref={svg}
              className="overlay"
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              aria-label="Window outline; drag the vertices in simulation mode"
              style={{ opacity: 0 }}
              onPointerMove={(e) => {
                if (dragging.current !== null)
                  engine.current?.setPoint(
                    dragging.current,
                    pointerToUV(e.clientX, e.clientY, {
                      left:
                        host.current!.getBoundingClientRect().left +
                        host.current!.clientLeft,
                      top:
                        host.current!.getBoundingClientRect().top +
                        host.current!.clientTop,
                      width: host.current!.clientWidth,
                      height: host.current!.clientHeight,
                    }),
                  );
              }}
              onPointerUp={() => {
                dragging.current = null;
              }}
              onPointerCancel={() => {
                dragging.current = null;
              }}
            >
              <polygon fill="none" vectorEffect="non-scaling-stroke" />
              {[0, 1, 2, 3].map((i) => (
                <g key={i} className="vertex">
                  <circle
                    className="handle-hit"
                    r="22"
                    vectorEffect="non-scaling-stroke"
                    role="slider"
                    aria-label={`Vertex ${i + 1}`}
                    aria-valuetext="Use the arrow keys to move the vertex"
                    tabIndex={
                      mode === "simulation" &&
                      outline &&
                      status.source !== "none"
                        ? 0
                        : -1
                    }
                    onKeyDown={(e) => {
                      const shifts: Record<string, [number, number]> = {
                        ArrowLeft: [-0.01, 0],
                        ArrowRight: [0.01, 0],
                        ArrowUp: [0, 0.01],
                        ArrowDown: [0, -0.01],
                      };
                      if (
                        shifts[e.key] &&
                        engine.current &&
                        mode === "simulation"
                      ) {
                        e.preventDefault();
                        const p = engine.current.manual[i],
                          d = shifts[e.key];
                        engine.current.setPoint(i, {
                          x: Math.max(0, Math.min(1, p.x + d[0])),
                          y: Math.max(0, Math.min(1, p.y + d[1])),
                        });
                      }
                    }}
                    onPointerDown={(e) => {
                      if (mode !== "simulation") return;
                      e.preventDefault();
                      dragging.current = i;
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                  />
                  <circle
                    className="vertex-dot"
                    r="5"
                    vectorEffect="non-scaling-stroke"
                  />
                  <text className="vertex-label" x="14" y="-14">
                    0{i + 1}
                  </text>
                </g>
              ))}
            </svg>
            {status.source !== "none" && (
              <>
                <span className="source-chip">
                  <i className={status.source === "camera" ? "live" : ""} />
                  {status.source === "camera"
                    ? "Live · mirrored"
                    : "Simulation · no camera"}
                </span>
                <select
                  className="effect-chip"
                  aria-label="Window shader"
                  value={effect}
                  onChange={(e) => changeEffect(Number(e.target.value))}
                >
                  {effects.map((item, i) => (
                    <option key={item.name} value={i}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <div className="stage-actions">
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                aria-pressed={fullscreen}
              >
                <span aria-hidden="true">⛶</span>{" "}
                {fullscreen ? "Exit fullscreen" : "Fullscreen"}
              </button>
              <button
                type="button"
                className={recordingActive ? "is-recording" : ""}
                disabled={
                  recording.phase === "stopping" ||
                  (!recordingActive && status.source === "none")
                }
                onClick={() =>
                  recordingActive
                    ? engine.current?.stopRecording()
                    : engine.current?.startRecording()
                }
              >
                <span aria-hidden="true">{recordingActive ? "■" : "●"}</span>{" "}
                {recordingActive
                  ? "Stop recording"
                  : recording.phase === "stopping"
                    ? "Preparing video…"
                    : "Record"}
              </button>
              {(recordingActive || recording.phase === "stopping") && (
                <span
                  className="recording-time"
                  role="timer"
                  aria-label="Recording duration"
                >
                  {elapsed} · {recording.format}
                </span>
              )}
              {recording.url && (
                <a href={recording.url} download={recording.filename}>
                  Download {recording.format} ↓
                </a>
              )}
              {(screenError || recording.error) && (
                <p className="capture-error" role="alert">
                  {screenError || recording.error}
                </p>
              )}
            </div>
          </div>
          <div className="stage-caption">
            <span className="instruction-icon">⌁</span>
            <p>
              {mode === "hands"
                ? "Spread your index fingers and thumbs to create the window."
                : "Drag the four vertices. Keep the shape convex, with no crossed edges."}
            </p>
            <span className="vertex-count">04 VERTICES</span>
          </div>
          <div
            role="status"
            aria-live="polite"
            className={`message ${status.error ? "error" : ""}`}
          >
            {status.error ||
              (status.geometry === "invalid"
                ? "The window is invalid. Move the points apart and avoid crossing the edges."
                : status.camera === "on" && mode === "hands" && status.hands < 2
                  ? "Place both hands in view of the camera."
                  : status.source === "test"
                    ? "Locally generated test image. Start the camera to apply the effect to your video."
                    : "Video is processed locally. Record whenever you choose; nothing is uploaded.")}
          </div>
        </div>
        <aside aria-label="Controls">
          <div className="panel-heading">
            <h2>Your window</h2>
            <span>01 — 03</span>
          </div>
          <section className="control-group">
            <h3>
              <span>01</span> Control
            </h3>
            <div
              className="segmented"
              role="group"
              aria-label="Control mode"
            >
              <button
                aria-pressed={mode === "hands"}
                onClick={() => changeMode("hands")}
              >
                Hands
              </button>
              <button
                aria-pressed={mode === "simulation"}
                onClick={() => changeMode("simulation")}
              >
                Simulation
              </button>
            </div>
            <div className="tracking-status">
              <span>
                {mode === "simulation"
                  ? "Manual control"
                  : status.model === "loading"
                    ? "Loading model…"
                    : status.model === "ready"
                      ? "Model ready"
                      : status.model === "error"
                        ? "Model error"
                        : "Model idle"}
              </span>
              <span>{status.hands}/2 hands</span>
            </div>
            {status.model === "error" && (
              <button
                className="text-button"
                onClick={() => engine.current?.retryModel()}
              >
                Retry model load
              </button>
            )}
          </section>
          <section className="control-group">
            <h3>
              <span>02</span> Effect
            </h3>
            <div className="effects" role="group" aria-label="Visual effect">
              {effects.map((item, i) => (
                <button
                  className={`effect-option ${effect === i ? "selected" : ""}`}
                  key={item.name}
                  aria-pressed={effect === i}
                  onClick={() => changeEffect(i)}
                >
                  <span
                    className={`effect-swatch ${item.className}`}
                    aria-hidden="true"
                  />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.note}</small>
                  </span>
                  <span className="radio" aria-hidden="true" />
                </button>
              ))}
            </div>
            <label className="range-label" htmlFor="intensity">
              Intensity{" "}
              <output>
                {intensity}
                <span>%</span>
              </output>
            </label>
            <input
              id="intensity"
              type="range"
              min="0"
              max="100"
              value={intensity}
              style={{ "--range": `${intensity}%` } as React.CSSProperties}
              onChange={(e) => {
                const n = Number(e.target.value);
                setIntensity(n);
                if (engine.current) engine.current.intensity = n / 100;
              }}
            />
            <div className="range-extremes">
              <span>Original</span>
              <span>Maximum</span>
            </div>
          </section>
          <section className="control-group display-group">
            <h3>
              <span>03</span> Display
            </h3>
            <label className="toggle-label">
              Outline and vertices
              <input
                type="checkbox"
                checked={outline}
                onChange={(e) => {
                  setOutline(e.target.checked);
                  if (engine.current) engine.current.outline = e.target.checked;
                }}
              />
              <span className="switch" aria-hidden="true" />
            </label>
            <button
              className="reset-button"
              disabled={mode !== "simulation"}
              onClick={() => engine.current?.reset()}
            >
              <span aria-hidden="true">↺</span> Reset vertices
            </button>
          </section>
          <button
            className={`camera-button ${cameraActive ? "stop" : ""}`}
            onClick={() =>
              cameraActive
                ? engine.current?.stop()
                : void engine.current?.startCamera()
            }
          >
            <span aria-hidden="true">{cameraActive ? "◼" : "▣"}</span>
            {status.camera === "requesting"
              ? "Cancel request"
              : status.camera === "on"
                ? "Stop camera"
                : "Start camera"}
          </button>
        </aside>
      </section>
      <footer>
        <span>WINDOW SHADER</span>
  
        <span>LOCAL · PRIVATE · REAL TIME</span>
      </footer>
    </main>
  );
}
