import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type {
  ManagedRole,
  ServerSettingsSection,
} from '@/features/server-settings/types';
import {
  hsvToRgb,
  hsvToHex,
  rgbToHsl,
  hexToHsv,
  parseColorInputToHsv,
  rgbToHsv,
  hslToRgb,
  suggestLightAlternative,
  clampInt,
} from '@/features/server-settings/colorUtils';

type ColorTarget = 'single' | 'dark' | 'light';

interface UseRoleColorPickerOptions {
  selectedRole: Ref<ManagedRole | null>;
  roleManagerDirty: Ref<boolean>;
  activeSection: Ref<ServerSettingsSection>;
  roleEditorTab: Ref<'display' | 'permissions' | 'members'>;
  selectedRoleId: Ref<string>;
}

export function useRoleColorPicker(options: UseRoleColorPickerOptions) {
  const {
    selectedRole,
    roleManagerDirty,
    activeSection,
    roleEditorTab,
    selectedRoleId,
  } = options;

  const roleCustomPanelOpen = ref(false);
  const rolePickerH = ref(230);
  const rolePickerS = ref(0.7);
  const rolePickerV = ref(0.85);
  const roleHexInput = ref('#5865F2');
  const roleRInput = ref(88);
  const roleGInput = ref(101);
  const roleBInput = ref(242);
  const roleHInput = ref(230);
  const roleSInput = ref(70);
  const roleLInput = ref(65);
  const colorWheelCanvasRef = ref<HTMLCanvasElement | null>(null);

  /** Assign from the roles section via a template ref callback — refs passed as props are unwrapped, so prop-based Ref wiring breaks. */
  function setColorWheelCanvasEl(el: HTMLCanvasElement | null) {
    colorWheelCanvasRef.value = el;
  }

  const wheelDragging = ref(false);
  const wheelDragMode = ref<'sv' | 'v' | null>(null);
  const roleColorTarget = ref<ColorTarget>('single');

  function resetPickerState() {
    roleCustomPanelOpen.value = false;
    roleColorTarget.value = 'single';
  }

  function roleColorByTarget(target: ColorTarget): string {
    if (!selectedRole.value) return '#5865F2';
    if (target === 'single') return selectedRole.value.color;
    return target === 'dark'
      ? selectedRole.value.darkColor
      : selectedRole.value.lightColor;
  }

  function applyRoleColorByTarget(target: ColorTarget, color: string) {
    if (!selectedRole.value) return;
    const rt = selectedRole.value.roleType;
    if (rt === 'authority') return;
    if (rt === 'visual') {
      selectedRole.value.color = color;
      selectedRole.value.darkColor = color;
      selectedRole.value.lightColor = color;
      return;
    }
    if (target === 'single') {
      selectedRole.value.color = color;
      if (!selectedRole.value.separateThemeColors) {
        selectedRole.value.darkColor = color;
        selectedRole.value.lightColor = color;
      }
    } else if (target === 'dark') {
      selectedRole.value.darkColor = color;
    } else {
      selectedRole.value.lightColor = color;
    }
  }

  function syncTextInputsFromHsv() {
    const [r, g, b] = hsvToRgb(
      rolePickerH.value,
      rolePickerS.value,
      rolePickerV.value,
    );
    const hsl = rgbToHsl(r, g, b);
    roleRInput.value = r;
    roleGInput.value = g;
    roleBInput.value = b;
    roleHInput.value = hsl.h;
    roleSInput.value = hsl.s;
    roleLInput.value = hsl.l;
  }

  function drawColorWheel() {
    const canvas = colorWheelCanvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const outerRadius = size / 2 - 1;
    const ringWidth = 18;
    const gap = 4;
    const innerRadius = outerRadius - ringWidth - gap;
    const v = rolePickerV.value;
    const imageData = ctx.createImageData(size, size);
    const d = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * size + x) * 4;
        if (dist <= innerRadius) {
          const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
          const sat = Math.min(dist / innerRadius, 1);
          const [r, g, b] = hsvToRgb(hue, sat, v);
          d[idx] = r;
          d[idx + 1] = g;
          d[idx + 2] = b;
          d[idx + 3] = 255;
        } else if (dist >= innerRadius + gap && dist <= outerRadius) {
          const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
          const vv = 1 - angle / 360;
          const [r, g, b] = hsvToRgb(rolePickerH.value, rolePickerS.value, vv);
          d[idx] = r;
          d[idx + 1] = g;
          d[idx + 2] = b;
          d[idx + 3] = 255;
        } else {
          d[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);

    const angleRad = (rolePickerH.value * Math.PI) / 180;
    const hd = rolePickerS.value * innerRadius;
    const hx = cx + hd * Math.cos(angleRad);
    const hy = cy + hd * Math.sin(angleRad);
    ctx.beginPath();
    ctx.arc(hx, hy, 7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx, hy, 7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const valueAngle = (1 - rolePickerV.value) * 360;
    const va = (valueAngle * Math.PI) / 180;
    const vr = innerRadius + gap + ringWidth / 2;
    const vx = cx + vr * Math.cos(va);
    const vy = cy + vr * Math.sin(va);
    ctx.beginPath();
    ctx.arc(vx, vy, 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(vx, vy, 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function syncPickerFromColor() {
    if (!selectedRole.value) return;
    const currentColor = roleColorByTarget(roleColorTarget.value);
    const fallbackColor = '#5865F2';
    const hsv = hexToHsv(currentColor || fallbackColor);
    if (!hsv) return;
    rolePickerH.value = hsv.h;
    rolePickerS.value = hsv.s;
    rolePickerV.value = hsv.v;
    roleHexInput.value = (currentColor || fallbackColor).toUpperCase();
    syncTextInputsFromHsv();
  }

  function setSelectedRoleColor(color: string) {
    if (!selectedRole.value) return;
    applyRoleColorByTarget(roleColorTarget.value, color);
    roleManagerDirty.value = true;
    if (roleCustomPanelOpen.value) {
      syncPickerFromColor();
      void nextTick(drawColorWheel);
    }
  }

  function updateColorFromPicker() {
    const hex = hsvToHex(
      rolePickerH.value,
      rolePickerS.value,
      rolePickerV.value,
    );
    roleHexInput.value = hex;
    syncTextInputsFromHsv();
    setSelectedRoleColor(hex);
    void nextTick(drawColorWheel);
  }

  function handleWheelMove(event: MouseEvent) {
    const canvas = colorWheelCanvasRef.value;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const outerRadius = cx - 1;
    const ringWidth = 18;
    const gap = 4;
    const innerRadius = outerRadius - ringWidth - gap;
    const ringInner = innerRadius + gap;
    const dx = (event.clientX - rect.left) * scale - cx;
    const dy = (event.clientY - rect.top) * scale - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;

    if (!wheelDragMode.value) {
      if (dist <= innerRadius) wheelDragMode.value = 'sv';
      else if (dist >= ringInner && dist <= outerRadius)
        wheelDragMode.value = 'v';
      else return;
    }

    if (wheelDragMode.value === 'sv') {
      rolePickerH.value = angle;
      rolePickerS.value = Math.min(dist / innerRadius, 1);
    } else if (wheelDragMode.value === 'v') {
      rolePickerV.value = Math.max(0, Math.min(1, 1 - angle / 360));
    }
    updateColorFromPicker();
  }

  function onWheelPointerDown(event: MouseEvent) {
    wheelDragging.value = true;
    wheelDragMode.value = null;
    handleWheelMove(event);
  }

  function onGlobalMouseMove(event: MouseEvent) {
    if (wheelDragging.value) handleWheelMove(event);
  }

  function onGlobalMouseUp() {
    wheelDragging.value = false;
    wheelDragMode.value = null;
  }

  function toggleRoleCustomPanel() {
    roleCustomPanelOpen.value = !roleCustomPanelOpen.value;
    if (roleCustomPanelOpen.value) {
      syncPickerFromColor();
      void nextTick(drawColorWheel);
    }
  }

  function openRoleCustomPanel(target: ColorTarget) {
    const r = selectedRole.value;
    if (r?.roleType === 'authority') return;
    const effTarget = r?.roleType === 'visual' ? 'single' : target;
    if (roleCustomPanelOpen.value && roleColorTarget.value === effTarget) {
      roleCustomPanelOpen.value = false;
      return;
    }
    roleColorTarget.value = effTarget;
    roleCustomPanelOpen.value = true;
    syncPickerFromColor();
    void nextTick(drawColorWheel);
  }

  function selectRoleColorPreset(target: ColorTarget, color: string) {
    roleColorTarget.value = target;
    setSelectedRoleColor(color);
  }

  function setSeparateThemeColors(value: boolean) {
    if (!selectedRole.value) return;
    if (selectedRole.value.roleType !== 'mixed') return;
    selectedRole.value.separateThemeColors = value;
    if (value) {
      selectedRole.value.darkColor = selectedRole.value.color;
      selectedRole.value.lightColor = suggestLightAlternative(
        selectedRole.value.color,
      );
      roleColorTarget.value = 'dark';
    } else {
      selectedRole.value.color = selectedRole.value.darkColor;
      roleColorTarget.value = 'single';
    }
    roleManagerDirty.value = true;
  }

  function onPickerHexBlur() {
    const hsv = parseColorInputToHsv(roleHexInput.value);
    if (!hsv) {
      roleHexInput.value =
        selectedRole.value?.color?.toUpperCase?.() ?? '#5865F2';
      return;
    }
    rolePickerH.value = hsv.h;
    rolePickerS.value = hsv.s;
    rolePickerV.value = hsv.v;
    setSelectedRoleColor(hsvToHex(hsv.h, hsv.s, hsv.v));
    syncTextInputsFromHsv();
    void nextTick(drawColorWheel);
  }

  function onRgbInputsBlur() {
    const r = Math.max(0, Math.min(255, Number(roleRInput.value)));
    const g = Math.max(0, Math.min(255, Number(roleGInput.value)));
    const b = Math.max(0, Math.min(255, Number(roleBInput.value)));
    const hsv = rgbToHsv(r, g, b);
    rolePickerH.value = hsv.h;
    rolePickerS.value = hsv.s;
    rolePickerV.value = hsv.v;
    updateColorFromPicker();
  }

  function onHslInputsBlur() {
    const h = Number(roleHInput.value);
    const s = Math.max(0, Math.min(100, Number(roleSInput.value)));
    const l = Math.max(0, Math.min(100, Number(roleLInput.value)));
    const [r, g, b] = hslToRgb(h, s / 100, l / 100);
    const hsv = rgbToHsv(r, g, b);
    rolePickerH.value = hsv.h;
    rolePickerS.value = hsv.s;
    rolePickerV.value = hsv.v;
    updateColorFromPicker();
  }

  function nudgeRgb(channel: 'r' | 'g' | 'b', delta: number) {
    if (channel === 'r')
      roleRInput.value = clampInt(roleRInput.value + delta, 0, 255);
    if (channel === 'g')
      roleGInput.value = clampInt(roleGInput.value + delta, 0, 255);
    if (channel === 'b')
      roleBInput.value = clampInt(roleBInput.value + delta, 0, 255);
    onRgbInputsBlur();
  }

  function nudgeHsl(channel: 'h' | 's' | 'l', delta: number) {
    if (channel === 'h')
      roleHInput.value = clampInt(roleHInput.value + delta, 0, 360);
    if (channel === 's')
      roleSInput.value = clampInt(roleSInput.value + delta, 0, 100);
    if (channel === 'l')
      roleLInput.value = clampInt(roleLInput.value + delta, 0, 100);
    onHslInputsBlur();
  }

  watch(roleCustomPanelOpen, (open) => {
    if (open) {
      window.addEventListener('mousemove', onGlobalMouseMove);
      window.addEventListener('mouseup', onGlobalMouseUp);
      void nextTick(drawColorWheel);
    } else {
      window.removeEventListener('mousemove', onGlobalMouseMove);
      window.removeEventListener('mouseup', onGlobalMouseUp);
    }
  });

  watch(
    colorWheelCanvasRef,
    (canvas) => {
      if (canvas && roleCustomPanelOpen.value) {
        void nextTick(() => {
          drawColorWheel();
        });
      }
    },
    { flush: 'post' },
  );

  watch([activeSection, roleEditorTab], ([section, tab]) => {
    if (section === 'Roles' && tab === 'display' && roleCustomPanelOpen.value) {
      void nextTick(drawColorWheel);
    }
  });

  watch(selectedRoleId, () => {
    resetPickerState();
  });

  onBeforeUnmount(() => {
    window.removeEventListener('mousemove', onGlobalMouseMove);
    window.removeEventListener('mouseup', onGlobalMouseUp);
  });

  return {
    roleCustomPanelOpen,
    roleColorTarget,
    roleHexInput,
    roleRInput,
    roleGInput,
    roleBInput,
    roleHInput,
    roleSInput,
    roleLInput,
    setColorWheelCanvasEl,
    toggleRoleCustomPanel,
    openRoleCustomPanel,
    selectRoleColorPreset,
    setSeparateThemeColors,
    onPickerHexBlur,
    onRgbInputsBlur,
    onHslInputsBlur,
    nudgeRgb,
    nudgeHsl,
    onWheelPointerDown,
    resetPickerState,
  };
}
