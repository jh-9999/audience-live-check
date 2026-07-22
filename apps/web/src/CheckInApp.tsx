import type { ReactElement } from "react";
import { useCheckIn } from "./use-check-in";
import "./styles.css";

export function CheckInApp(): ReactElement {
  const { status, message, servedBy, start } = useCheckIn();
  const isButtonDisabled = status === "starting";
  const statusLabel =
    status === "starting"
      ? "참여 시작 중"
      : status === "active"
        ? "✓ 참여 중 · 연결됨"
        : status === "completed"
          ? "✓ 참여 완료"
          : null;

  return (
    <main className="page-shell">
      <section
        className="check-in-panel"
        aria-labelledby="service-title"
        data-served-by={
          import.meta.env.DEV ? (servedBy ?? undefined) : undefined
        }
      >
        <p className="eyebrow">LIVE CHECK-IN</p>
        <h1 id="service-title">발표 데모에 참여해 주세요 해건님</h1>
        <p className="privacy-note">별도의 개인정보는 저장하지 않습니다.</p>
        <button
          className="check-in-button"
          type="button"
          disabled={isButtonDisabled}
          onClick={start}
        >
          {status === "starting"
            ? "참여 중..."
            : status === "active"
              ? "다시 요청하기"
              : status === "completed"
                ? "다시 요청하기"
                : "참여하기"}
        </button>
        {statusLabel !== null ? (
          <div
            className="status-message status-success"
            role="status"
            aria-live="polite"
          >
            <strong>{statusLabel}</strong>
            <span>{message}</span>
          </div>
        ) : status === "error" ? (
          <div
            className="status-message status-error"
            role="alert"
            aria-live="assertive"
          >
            <strong>참여하지 못했습니다</strong>
            <span>{message}</span>
          </div>
        ) : null}
      </section>
    </main>
  );
}
