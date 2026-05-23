// elevenlabs-convai/react — front-end subpath entry.
// Imported as: import { VoiceWidget } from '@caistech/elevenlabs-convai/react';
// Requires the optional peers `react` and `@elevenlabs/react`.

export { VoiceWidget, default } from './VoiceWidget.js';
export {
  buildStartOptions,
  launcherLabel,
  panelHeader,
  shouldUseTextFallback,
  placementClass,
  statusLabel,
  WIDGET_CSS,
} from './widget-logic.js';
export type { StartOptions } from './widget-logic.js';
export type {
  VoiceWidgetProps,
  VoiceConfig,
  VoiceConfigBase,
  VoicePlacement,
  VoiceMode,
  VoiceConnectionStatus,
} from '../types.js';
