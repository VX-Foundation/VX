/**
 * Canonical public widget registry assembled from generated per-widget contracts.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../contracts.js';
import { definition as AccordionDefinition } from './definitions/Accordion.js';
import { definition as AudioDefinition } from './definitions/Audio.js';
import { definition as AvatarDefinition } from './definitions/Avatar.js';
import { definition as BadgeDefinition } from './definitions/Badge.js';
import { definition as BreadcrumbDefinition } from './definitions/Breadcrumb.js';
import { definition as ButtonDefinition } from './definitions/Button.js';
import { definition as CanvasDefinition } from './definitions/Canvas.js';
import { definition as CheckboxDefinition } from './definitions/Checkbox.js';
import { definition as DataTableDefinition } from './definitions/DataTable.js';
import { definition as DatePickerDefinition } from './definitions/DatePicker.js';
import { definition as DividerDefinition } from './definitions/Divider.js';
import { definition as DrawerDefinition } from './definitions/Drawer.js';
import { definition as ErrorSummaryDefinition } from './definitions/ErrorSummary.js';
import { definition as FieldErrorDefinition } from './definitions/FieldError.js';
import { definition as FieldGroupDefinition } from './definitions/FieldGroup.js';
import { definition as FileUploadDefinition } from './definitions/FileUpload.js';
import { definition as FormDefinition } from './definitions/Form.js';
import { definition as FormErrorDefinition } from './definitions/FormError.js';
import { definition as IconDefinition } from './definitions/Icon.js';
import { definition as IFrameDefinition } from './definitions/IFrame.js';
import { definition as ImageDefinition } from './definitions/Image.js';
import { definition as InputDefinition } from './definitions/Input.js';
import { definition as LinkDefinition } from './definitions/Link.js';
import { definition as ListDefinition } from './definitions/List.js';
import { definition as ModalDefinition } from './definitions/Modal.js';
import { definition as PopoverDefinition } from './definitions/Popover.js';
import { definition as ProgressBarDefinition } from './definitions/ProgressBar.js';
import { definition as RadioDefinition } from './definitions/Radio.js';
import { definition as ScrollViewDefinition } from './definitions/ScrollView.js';
import { definition as SelectDefinition } from './definitions/Select.js';
import { definition as SkeletonDefinition } from './definitions/Skeleton.js';
import { definition as SliderDefinition } from './definitions/Slider.js';
import { definition as SpinnerDefinition } from './definitions/Spinner.js';
import { definition as SwitchDefinition } from './definitions/Switch.js';
import { definition as TabsDefinition } from './definitions/Tabs.js';
import { definition as TextDefinition } from './definitions/Text.js';
import { definition as TextAreaDefinition } from './definitions/TextArea.js';
import { definition as TitleDefinition } from './definitions/Title.js';
import { definition as ToastDefinition } from './definitions/Toast.js';
import { definition as TooltipDefinition } from './definitions/Tooltip.js';
import { definition as VideoDefinition } from './definitions/Video.js';
import { definition as ViewDefinition } from './definitions/View.js';
import { definition as VirtualListDefinition } from './definitions/VirtualList.js';

export const PRIMITIVE_NAMES = [
    "Accordion",
    "Audio",
    "Avatar",
    "Badge",
    "Breadcrumb",
    "Button",
    "Canvas",
    "Checkbox",
    "DataTable",
    "DatePicker",
    "Divider",
    "Drawer",
    "ErrorSummary",
    "FieldError",
    "FieldGroup",
    "FileUpload",
    "Form",
    "FormError",
    "Icon",
    "IFrame",
    "Image",
    "Input",
    "Link",
    "List",
    "Modal",
    "Popover",
    "ProgressBar",
    "Radio",
    "ScrollView",
    "Select",
    "Skeleton",
    "Slider",
    "Spinner",
    "Switch",
    "Tabs",
    "Text",
    "TextArea",
    "Title",
    "Toast",
    "Tooltip",
    "Video",
    "View",
    "VirtualList"
  ] as const;
export type PrimitiveName = typeof PRIMITIVE_NAMES[number];
export const WIDGET_REGISTRY: Readonly<Record<PrimitiveName, WidgetDefinition>> = Object.freeze({
  Accordion: AccordionDefinition,
  Audio: AudioDefinition,
  Avatar: AvatarDefinition,
  Badge: BadgeDefinition,
  Breadcrumb: BreadcrumbDefinition,
  Button: ButtonDefinition,
  Canvas: CanvasDefinition,
  Checkbox: CheckboxDefinition,
  DataTable: DataTableDefinition,
  DatePicker: DatePickerDefinition,
  Divider: DividerDefinition,
  Drawer: DrawerDefinition,
  ErrorSummary: ErrorSummaryDefinition,
  FieldError: FieldErrorDefinition,
  FieldGroup: FieldGroupDefinition,
  FileUpload: FileUploadDefinition,
  Form: FormDefinition,
  FormError: FormErrorDefinition,
  Icon: IconDefinition,
  IFrame: IFrameDefinition,
  Image: ImageDefinition,
  Input: InputDefinition,
  Link: LinkDefinition,
  List: ListDefinition,
  Modal: ModalDefinition,
  Popover: PopoverDefinition,
  ProgressBar: ProgressBarDefinition,
  Radio: RadioDefinition,
  ScrollView: ScrollViewDefinition,
  Select: SelectDefinition,
  Skeleton: SkeletonDefinition,
  Slider: SliderDefinition,
  Spinner: SpinnerDefinition,
  Switch: SwitchDefinition,
  Tabs: TabsDefinition,
  Text: TextDefinition,
  TextArea: TextAreaDefinition,
  Title: TitleDefinition,
  Toast: ToastDefinition,
  Tooltip: TooltipDefinition,
  Video: VideoDefinition,
  View: ViewDefinition,
  VirtualList: VirtualListDefinition,
});
export const PRIMITIVE_SOURCES: Readonly<Record<PrimitiveName, string>> = Object.freeze(
  Object.fromEntries(PRIMITIVE_NAMES.map((name) => [name, WIDGET_REGISTRY[name].source])) as Record<PrimitiveName, string>
);
export const PRIMITIVE_CONTRACT_SOURCES: Readonly<Record<PrimitiveName, string>> = Object.freeze(
  Object.fromEntries(PRIMITIVE_NAMES.map((name) => [name, WIDGET_REGISTRY[name].contractSource])) as Record<PrimitiveName, string>
);
