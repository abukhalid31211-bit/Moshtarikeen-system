// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
