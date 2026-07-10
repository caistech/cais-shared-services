/**
 * @caistech/discovery-agent/react
 *
 * The client widget. Wraps `@caistech/elevenlabs-convai/react` `VoiceWidget` and adds the two
 * things the discovery pattern needs that the base widget leaves to the consumer:
 *   1. STAGED re-grounding — pushes each stage's `context` via onReady.sendContextualUpdate as the
 *      flow advances (the Singify coach-steps pattern, generalised).
 *   2. The wrap-up TIMER — a browser onConnect timer that folds a "about N minutes to go" nudge
 *      into the agent and shows an always-on banner (the cap the base widget does not implement;
 *      the browser onConnect timer is the reliable elapsed-time source per the VOICE AI standard).
 *
 * The product supplies the same `Discovery` config; the widget reads its stages + persona and mounts
 * the base VoiceWidget with the per-session prompt override (the PUSH) + the signed token as identity.
 */

import * as React from "react";
import { VoiceWidget } from "@caistech/elevenlabs-convai/react";
import { DEFAULTS, type DiscoveryConfig, type DiscoveryStage } from "../index.js";

/** The imperative controls the base widget hands back on ready. */
interface VoiceControls {
  sendUserMessage: (text: string) => void;
  sendContextualUpdate: (text: string) => void;
}

export interface DiscoveryWidgetProps<T> {
  config: DiscoveryConfig<T>;
  /** The signed session token + agent id + pushed prompt override from Discovery.startSession(). */
  session: { token: string; agentId: string; promptOverride?: string };
  /** The current stage id; the widget re-grounds the agent whenever this changes. */
  activeStageId: string;
  /** Placement of the base widget (defaults to 'inline'). */
  placement?: "floating" | "sidebar" | "header" | "inline" | "fullpage";
  onStageComplete?: (stageId: string) => void;
  onEnd?: () => void;
}

/**
 * Renders the voice discovery widget: mounts the convai VoiceWidget with the per-session prompt
 * override + the signed token as identity, re-grounds the agent on each stage change, and runs the
 * browser wrap-up timer.
 */
export function DiscoveryWidget<T>(props: DiscoveryWidgetProps<T>): React.ReactElement {
  const { config, session, activeStageId, placement = "inline", onEnd } = props;
  const controlsRef = React.useRef<VoiceControls | null>(null);
  const wrapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wrapUpVisible, setWrapUpVisible] = React.useState(false);

  const stage: DiscoveryStage | undefined = config.stages.find((s) => s.id === activeStageId);
  const maxDuration = config.maxDurationSeconds ?? DEFAULTS.maxDurationSeconds;
  const wrapWarning = config.wrapWarningSeconds ?? DEFAULTS.wrapWarningSeconds;

  // (a) Staged re-grounding: whenever the active stage changes, push its surface context so the
  // agent speaks about THIS step (the coach-steps pattern).
  React.useEffect(() => {
    if (stage && controlsRef.current) {
      controlsRef.current.sendContextualUpdate(
        `The user is now at stage "${stage.id}": ${stage.goal}. ${stage.context}`
      );
    }
    // Re-run on stage id change; controls are read from the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStageId]);

  // Clear the wrap timer on unmount.
  React.useEffect(() => {
    return () => {
      if (wrapTimerRef.current) clearTimeout(wrapTimerRef.current);
    };
  }, []);

  const startWrapTimer = React.useCallback(() => {
    if (wrapTimerRef.current) clearTimeout(wrapTimerRef.current);
    const fireInMs = Math.max(0, (maxDuration - wrapWarning) * 1000);
    wrapTimerRef.current = setTimeout(() => {
      const minutes = Math.max(1, Math.round(wrapWarning / 60));
      controlsRef.current?.sendContextualUpdate(
        `The session is nearly at its time limit. Gently tell the user about ${minutes} ` +
          `minute${minutes === 1 ? "" : "s"} remain, and begin wrapping up.`
      );
      setWrapUpVisible(true);
    }, fireInMs);
  }, [maxDuration, wrapWarning]);

  const overrides = session.promptOverride
    ? { agent: { prompt: { prompt: session.promptOverride } } }
    : undefined;

  return React.createElement(
    "div",
    { "data-discovery-agent": config.slug, "data-stage": stage?.id },
    wrapUpVisible
      ? React.createElement(
          "div",
          {
            role: "status",
            "data-discovery-wrapup": true,
            style: {
              fontSize: 14,
              padding: "8px 12px",
              marginBottom: 8,
              borderRadius: 8,
              background: "#fef3c7",
              color: "#92400e",
            },
          },
          `About ${Math.max(1, Math.round(wrapWarning / 60))} min left — wrapping up.`
        )
      : null,
    React.createElement(VoiceWidget, {
      agentId: session.agentId,
      // The signed token carries identity (verified server-side in resolveSession); never a bare id.
      userId: session.token,
      sessionId: session.token,
      mode: "discovery",
      placement,
      overrides,
      title: config.persona.name,
      coachName: config.persona.name,
      onReady: (controls: VoiceControls) => {
        controlsRef.current = controls;
        // Ground the opening stage immediately.
        if (stage) {
          controls.sendContextualUpdate(
            `The user is starting at stage "${stage.id}": ${stage.goal}. ${stage.context}`
          );
        }
      },
      onConnect: startWrapTimer,
      onDisconnect: onEnd,
    })
  );
}

export default DiscoveryWidget;
