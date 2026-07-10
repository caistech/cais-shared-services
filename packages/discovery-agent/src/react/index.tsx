/**
 * @caistech/discovery-agent/react
 *
 * The client widget. Wraps `@caistech/elevenlabs-convai/react` `VoiceWidget` and adds the two
 * things the discovery pattern needs that the base widget leaves to the consumer:
 *   1. STAGED re-grounding — pushes each stage's `context` via onReady.sendContextualUpdate as the
 *      flow advances (the Singify coach-steps pattern, generalised).
 *   2. The wrap-up TIMER — a browser onConnect timer that folds a "about N minutes to go" nudge
 *      into the agent and shows an always-on banner (the cap the base widget does not implement).
 *
 * The product supplies the same `Discovery` config; the widget reads its stages + persona.
 */

import * as React from "react";
import type { DiscoveryConfig, DiscoveryStage } from "../index.js";

export interface DiscoveryWidgetProps<T> {
  config: DiscoveryConfig<T>;
  /** The signed session token + pushed prompt override from Discovery.startSession(subjectId). */
  session: { token: string; promptOverride?: string };
  /** The current stage id; the widget re-grounds the agent when this changes. */
  activeStageId: string;
  onStageComplete?: (stageId: string) => void;
  onEnd?: () => void;
}

/**
 * Renders the voice discovery widget. Implementation (build-out) mounts the convai VoiceWidget with
 * `overrides.agent.prompt = session.promptOverride` (the PUSH), and on `onReady({ sendContextualUpdate })`
 * wires: (a) a stage effect that calls sendContextualUpdate(activeStage.context) whenever
 * activeStageId changes, and (b) a setTimeout from `onConnect` that at maxDuration - wrapWarning
 * folds a wrap-up instruction into the agent and reveals the banner.
 */
export function DiscoveryWidget<T>(props: DiscoveryWidgetProps<T>): React.ReactElement {
  const { config, activeStageId } = props;
  const stage: DiscoveryStage | undefined = config.stages.find((s) => s.id === activeStageId);
  // Build-out: replace this placeholder with the mounted <VoiceWidget/> + the two effects above.
  return React.createElement(
    "div",
    { "data-discovery-agent": config.slug, "data-stage": stage?.id },
    // <VoiceWidget agentId={...} overrides={{ agent: { prompt: session.promptOverride } }}
    //   onReady={wireStageAndTimer} onConnect={startWrapTimer} onDisconnect={props.onEnd} />
    null
  );
}
