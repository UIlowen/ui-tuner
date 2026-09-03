export { Picker, type PickerCallbacks } from "./picker/Picker";
export { Overlay } from "./overlay/Overlay";
export { Annotations, type AnnotationsCallbacks } from "./annotations/Annotations";
export { SelectionTracker, type SelectionTrackerOptions } from "./dom/selection";
export {
  assignUiTunerId,
  cssSelectorFor,
  releaseUiTunerId,
  readUiTunerId,
  textPreview,
  domFingerprintFor,
  UI_TUNER_ID_ATTR,
} from "./dom/identity";
export { domSnapshotFor, MAX_HTML_LENGTH } from "./dom/snapshot";
export { boundsFromRect, formatDimensions } from "./measurement/rect";

export { STYLE_PROPERTIES, isStyleProperty, type StyleProperty } from "./styles/whitelist";
export { pickStyles, type StyleSource } from "./styles/computed";
export {
  parseCssValue,
  formatCssValue,
  formatNumber,
  scrubMultiplier,
  clamp,
  type ParsedCssValue,
} from "./styles/parse";
export { rgbToHex } from "./styles/color";

export { PreviewEngine } from "./preview/PreviewEngine";
export { ChangeTracker } from "./changes/ChangeTracker";
export { InstructionStore } from "./changes/InstructionStore";
export { cssValuesEqual, normalizeCssValue } from "./changes/confirm";
export { StagingEngine } from "./staging/StagingEngine";
export type { StagedEdit } from "./staging/StagingEngine";
