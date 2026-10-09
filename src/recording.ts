export type RecordingState = {
  phase: "idle" | "recording" | "stopping" | "ready";
  seconds: number;
  url: string;
  filename: string;
  error: string;
  format: string;
};
export const emptyRecording = (): RecordingState => ({
  phase: "idle",
  seconds: 0,
  url: "",
  filename: "",
  error: "",
  format: "",
});

/** Captures only the rendered shader output, at a fixed size across resizes. */
export class VideoRecording {
  private state = emptyRecording();
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private timer = 0;
  private disposed = false;
  constructor(private notify: (state: RecordingState) => void) {}
  private update(patch: Partial<RecordingState>) {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.notify({ ...this.state });
  }
  start(source: HTMLCanvasElement) {
    if (this.disposed || this.recorder) return;
    try {
      if (
        typeof MediaRecorder === "undefined" ||
        !HTMLCanvasElement.prototype.captureStream
      )
        throw new Error(
          "This browser does not support recording. Try Chrome or Edge.",
        );
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1920 / source.width, 1080 / source.height);
      canvas.width = Math.max(2, Math.round((source.width * scale) / 2) * 2);
      canvas.height = Math.max(2, Math.round((source.height * scale) / 2) * 2);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the recording.");
      this.canvas = canvas;
      this.context = context;
      context.fillStyle = "#000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const stream = canvas.captureStream(30);
      this.stream = stream;
      const mimeType = [
        "video/mp4;codecs=avc1.42001f",
        "video/mp4",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 6_000_000,
      });
      this.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size && !this.disposed) chunks.push(event.data);
      };
      recorder.onerror = () => {
        this.update({
          error:
            "Recording was interrupted. You can download any recoverable video.",
        });
        this.stop();
      };
      recorder.onstop = () => {
        window.clearInterval(this.timer);
        stream.getTracks().forEach((track) => track.stop());
        this.recorder = null;
        this.stream = null;
        this.canvas = null;
        this.context = null;
        if (this.disposed) return;
        const type = recorder.mimeType || chunks[0]?.type || "video/webm";
        const blob = new Blob(chunks, { type });
        if (!blob.size) {
          this.update({
            phase: "idle",
            error:
              "Could not capture frames. Try again with video in motion.",
          });
          return;
        }
        const extension = type.includes("mp4") ? "mp4" : "webm";
        this.update({
          phase: "ready",
          format: extension.toUpperCase(),
          url: URL.createObjectURL(blob),
          filename: `window-shader-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`,
        });
      };
      recorder.start(1000);
      if (this.state.url) URL.revokeObjectURL(this.state.url);
      this.update({
        ...emptyRecording(),
        phase: "recording",
        format: recorder.mimeType.includes("mp4") ? "MP4" : "WebM",
      });
      const start = performance.now();
      this.timer = window.setInterval(
        () =>
          this.update({
            seconds: Math.floor((performance.now() - start) / 1000),
          }),
        1000,
      );
    } catch (error) {
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
      this.recorder = null;
      this.canvas = null;
      this.context = null;
      this.update({
        error:
          error instanceof Error
            ? error.message
            : "Could not start recording.",
      });
    }
  }
  frame(source: HTMLCanvasElement) {
    if (this.recorder?.state !== "recording" || !this.canvas || !this.context)
      return;
    const { width, height } = this.canvas;
    const scale = Math.min(width / source.width, height / source.height);
    this.context.fillStyle = "#000";
    this.context.fillRect(0, 0, width, height);
    this.context.drawImage(
      source,
      (width - source.width * scale) / 2,
      (height - source.height * scale) / 2,
      source.width * scale,
      source.height * scale,
    );
  }
  stop() {
    if (this.recorder?.state === "recording") {
      window.clearInterval(this.timer);
      this.update({ phase: "stopping" });
      this.recorder.stop();
    }
  }
  dispose() {
    this.disposed = true;
    this.stop();
    window.clearInterval(this.timer);
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.state.url) URL.revokeObjectURL(this.state.url);
    this.canvas = null;
    this.context = null;
  }
}
