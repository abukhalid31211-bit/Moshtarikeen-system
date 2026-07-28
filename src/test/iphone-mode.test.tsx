// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import Index from '../pages/Index';

// recharts needs these in jsdom
globalThis.ResizeObserver ??= class {
  observe() {} unobserve() {} disconnect() {}
} as unknown as typeof ResizeObserver;

const CONFIG_KEY = 'msys_config_v2';

function enableIPhone(extra: Record<string, unknown> = {}) {
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify({
    sectionNames: { dashboard: 'a', admin: 'b', addOperations: 'c', addSubscriber: 'd', systemAdmin: 'e' },
    cardOverrides: {}, queryCardOverrides: {}, institutionalText: '', systemDate: '',
    iPhoneConfig: { enabled: true, ...extra },
  }));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('iPhone mode — curved screen edges, no external device frame', () => {
  it('renders the curvature overlay with a border radius when enabled', () => {
    enableIPhone();
    render(<Index />);
    const curve = screen.getByTestId('iphone-screen-curvature');
    expect(curve).toBeTruthy();
    expect(curve.style.borderRadius).toBe('48px');
    // الظل الخارجي هو ما يملأ زوايا الشاشة خارج القوس
    expect(curve.style.boxShadow).toContain('600px');
    expect(curve.style.position).toBe('fixed');
    expect(curve.style.pointerEvents).toBe('none');
  });

  it('ignores any saved custom time and shows the real device time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 28, 15, 34, 0));
    enableIPhone({ customTime: '09:41' });
    render(<Index />);
    expect(screen.getByText('15:34')).toBeTruthy();
    expect(screen.queryByText('09:41')).toBeNull();
  });

  it('honours a legacy saved config that has no screenRadius key', () => {
    // إعداد قديم محفوظ قبل إضافة الانحناء → يجب أن يرجع للقيمة الافتراضية لا NaN
    enableIPhone({ dynamicIsland: 'normal', batteryLevel: 70, statusBarBg: '#ffffff' });
    render(<Index />);
    expect(screen.getByTestId('iphone-screen-curvature').style.borderRadius).toBe('48px');
  });

  it('respects a custom radius and clamps out-of-range values', () => {
    enableIPhone({ screenRadius: 999 });
    render(<Index />);
    expect(screen.getByTestId('iphone-screen-curvature').style.borderRadius).toBe('80px');
  });

  it('omits the overlay entirely when radius is 0 (straight corners)', () => {
    enableIPhone({ screenRadius: 0 });
    render(<Index />);
    expect(screen.queryByTestId('iphone-screen-curvature')).toBeNull();
  });

  it('shows the home indicator by default and hides it on request', () => {
    enableIPhone();
    render(<Index />);
    expect(screen.getByTestId('iphone-home-indicator')).toBeTruthy();
    cleanup();

    enableIPhone({ showHomeIndicator: false });
    render(<Index />);
    expect(screen.queryByTestId('iphone-home-indicator')).toBeNull();
  });

  it('paints html/body with the edge colour so no white shows around the curve', () => {
    enableIPhone({ screenEdgeColor: '#0f172a' });
    render(<Index />);
    expect(document.documentElement.style.backgroundColor).toBe('rgb(15, 23, 42)');
    expect(document.body.style.backgroundColor).toBe('rgb(15, 23, 42)');
  });

  it('hides the scrollbar while curved, and leaves the page untouched at radius 0', () => {
    enableIPhone();
    render(<Index />);
    expect(document.documentElement.classList.contains('iphone-screen-mode')).toBe(true);
    cleanup();
    expect(document.documentElement.classList.contains('iphone-screen-mode')).toBe(false);

    enableIPhone({ screenRadius: 0 });
    render(<Index />);
    expect(document.documentElement.classList.contains('iphone-screen-mode')).toBe(false);
    expect(document.documentElement.style.backgroundColor).toBe('');
  });

  it('renders no curvature overlay and no device chrome when the mode is off', () => {
    render(<Index />);
    expect(screen.queryByTestId('iphone-screen-curvature')).toBeNull();
    expect(screen.queryByTestId('iphone-home-indicator')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// حجم واجهة الآيفون (المقياس الأفقي/العمودي) + زر العودة للوضع السابق
// ─────────────────────────────────────────────────────────────

/** يفتح لوحة إعدادات وضع الآيفون (داخل تبويب systemAdmin) للوصول لمتحكمات الحجم */
async function openIPhoneSettingsPanel(container: HTMLElement) {
  const navButtons = screen.getAllByRole('button', { name: 'e' });
  fireEvent.click(navButtons[0]);
  await waitFor(() => {
    expect(container.textContent).toContain('حجم واجهة الآيفون');
  });
}

describe('iPhone UI scale — width/height controls and literal "previous mode" restore', () => {
  it('treats a legacy config without widthScale/heightScale as the previous mode, with no scaling applied', async () => {
    // إعداد قديم لا يحوي مفاتيح المقياس إطلاقاً
    enableIPhone({ screenRadius: 40 });
    const { container } = render(<Index />);
    // لا يجب إضافة أي تحجيم فعلي (بلا transform/width خاص) عند غياب المفاتيح
    const scaleWrapper = container.querySelector('[data-testid="iphone-ui-scale"]') as HTMLElement;
    expect(scaleWrapper.style.transform).toBe('');
    expect(scaleWrapper.style.width).toBe('');
    expect(scaleWrapper.style.minHeight).toBe('');

    await openIPhoneSettingsPanel(container);
    expect(screen.getByTestId('iphone-scale-status').textContent).toBe('الوضع السابق مفعل');
    expect((screen.getByTestId('iphone-scale-reset') as HTMLButtonElement).disabled).toBe(true);
  });

  it('defaults to 100%/100% and matches the previous (no-wrapper-effect) iPhone behaviour', async () => {
    enableIPhone({ widthScale: 100, heightScale: 100 });
    const { container } = render(<Index />);
    // عند 100%/100% لا نضيف أي تأثير Transform مرئي على الحاوية
    const scaleWrapper = container.querySelector('[data-testid="iphone-ui-scale"]') as HTMLElement;
    expect(scaleWrapper.style.transform).toBe('');
    expect(scaleWrapper.style.width).toBe('');

    await openIPhoneSettingsPanel(container);
    expect(screen.getByTestId('iphone-scale-status').textContent).toBe('الوضع السابق مفعل');
  });

  it('saves and applies a custom width/height scale, without affecting normal (non-iPhone) mode', async () => {
    enableIPhone({ widthScale: 90, heightScale: 110 });
    const { container } = render(<Index />);
    const scaleWrapper = container.querySelector('[data-testid="iphone-ui-scale"]') as HTMLElement;
    expect(scaleWrapper).toBeTruthy();
    expect(scaleWrapper.style.transform).toBe('scale(0.9, 1.1)');

    await openIPhoneSettingsPanel(container);
    expect(screen.getByTestId('iphone-scale-status').textContent).toBe('تطبيق مقياس مخصص: عرض 90% · طول 110%');
    cleanup();

    // خارج وضع الآيفون: لا تحجيم على واجهة الموقع العادية إطلاقاً
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify({
      sectionNames: { dashboard: 'a', admin: 'b', addOperations: 'c', addSubscriber: 'd', systemAdmin: 'e' },
      cardOverrides: {}, queryCardOverrides: {}, institutionalText: '', systemDate: '',
      iPhoneConfig: { enabled: false, widthScale: 90, heightScale: 110 },
    }));
    const { container: normalContainer } = render(<Index />);
    expect(normalContainer.querySelector('[data-testid="iphone-ui-scale"]')).toBeNull();
  });

  it('"العودة إلى الوضع السابق" restores 100%/100%, removes the scale wrapper, and leaves other iPhone settings untouched', async () => {
    enableIPhone({
      widthScale: 75, heightScale: 130,
      screenRadius: 64, screenEdgeColor: '#123456', batteryLevel: 42,
    });
    const { container } = render(<Index />);
    expect(container.querySelector('[data-testid="iphone-ui-scale"]')).toBeTruthy();

    await openIPhoneSettingsPanel(container);
    const resetBtn = screen.getByTestId('iphone-scale-reset') as HTMLButtonElement;
    expect(resetBtn.disabled).toBe(false);
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(screen.getByTestId('iphone-scale-status').textContent).toBe('الوضع السابق مفعل');
    });
    expect((screen.getByTestId('iphone-scale-reset') as HTMLButtonElement).disabled).toBe(true);
    // إزالة أثر التحجيم بالكامل من الحاوية (بلا تأثير Transform مرئي)
    const resetWrapper = container.querySelector('[data-testid="iphone-ui-scale"]') as HTMLElement;
    expect(resetWrapper.style.transform).toBe('');
    expect(resetWrapper.style.width).toBe('');

    // بقية إعدادات الآيفون تبقى كما هي تماماً
    const saved = JSON.parse(window.localStorage.getItem(CONFIG_KEY) || '{}');
    expect(saved.iPhoneConfig.screenRadius).toBe(64);
    expect(saved.iPhoneConfig.screenEdgeColor).toBe('#123456');
    expect(saved.iPhoneConfig.batteryLevel).toBe(42);
    expect(saved.iPhoneConfig.widthScale).toBe(100);
    expect(saved.iPhoneConfig.heightScale).toBe(100);
  });

  it('persists a custom scale across a reload (localStorage) without producing NaN/invalid CSS', () => {
    enableIPhone({ widthScale: 75, heightScale: 100 });
    const { container } = render(<Index />);
    const scaleWrapper = container.querySelector('[data-testid="iphone-ui-scale"]') as HTMLElement;
    expect(scaleWrapper.style.transform).toBe('scale(0.75, 1)');
    expect(scaleWrapper.style.transform).not.toContain('NaN');

    cleanup();
    const { container: reloaded } = render(<Index />);
    const reloadedWrapper = reloaded.querySelector('[data-testid="iphone-ui-scale"]') as HTMLElement;
    expect(reloadedWrapper.style.transform).toBe('scale(0.75, 1)');
  });
});

