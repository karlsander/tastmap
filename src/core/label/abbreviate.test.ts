import { describe, expect, it } from 'vitest';
import { abbreviateName, buildLegend } from './abbreviate';

describe('abbreviateName', () => {
  it('reproduces the hand-picked intuitive codes', () => {
    expect(abbreviateName('Greifswalder Straße')).toBe('GWS');
    expect(abbreviateName('Prenzlauer Allee')).toBe('PZA');
    expect(abbreviateName('Ella-Kay-Straße')).toBe('EKS');
    expect(abbreviateName('Rykestraße')).toBe('RYS');
  });

  it('skips letters bound in a German digraph (ch/ck) when picking the distinctive one', () => {
    expect(abbreviateName('Esmarchstraße')).toBe('EMS'); // not EHS — h is bound in "ch"
    expect(abbreviateName('Knaackstraße')).toBe('KNS'); // not KKS — k is bound in "ck"
  });

  it('detects a digraph at the start of a word (th), not just mid-word', () => {
    expect(abbreviateName('Thaerstraße')).toBe('TRS'); // 'th' skipped → R, not H
  });

  it('uses the road-type initial as the last letter', () => {
    expect(abbreviateName('Danziger Straße').endsWith('S')).toBe(true);
    expect(abbreviateName('Prenzlauer Allee').endsWith('A')).toBe(true);
    expect(abbreviateName('Storkower Weg').endsWith('W')).toBe(true);
  });

  it('always returns exactly three uppercase letters', () => {
    for (const n of ['Marienburger Straße', 'Am Friedrichshain', 'Bötzowstraße', 'Immanuelkirchstraße']) {
      expect(abbreviateName(n)).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('drops punctuation so station qualifiers never leak into a code', () => {
    // Parenthesised / slashed qualifiers are common on station names; the code
    // must stay three letters, never "BO(" or similar.
    for (const n of ['Berlin Ostkreuz (Stadtbahn)', 'Berlin Hbf (tief)', 'S+U Pankow']) {
      expect(abbreviateName(n)).toMatch(/^[A-Z]{3}$/);
    }
  });
});

describe('buildLegend', () => {
  it('assigns a unique code to every distinct name', () => {
    const names = [
      'Greifswalder Straße',
      'Danziger Straße',
      'Prenzlauer Allee',
      'Winsstraße',
      'Jablonskistraße',
      'Christburger Straße',
      'Marienburger Straße',
      'Bötzowstraße',
      'Pasteurstraße',
      'Rykestraße',
      'Esmarchstraße',
    ];
    const legend = buildLegend(names);
    const codes = legend.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length); // all unique
    expect(codes.every((c) => /^[A-Z]{3}$/.test(c))).toBe(true);
  });

  it('keeps the canonical code for the first name and shifts later collisions', () => {
    // Both names canonically want "RYS" (R + most-distinctive interior + S).
    const legend = buildLegend(['Rykestraße', 'Rylestraße']);
    expect(legend[0]).toEqual({ code: 'RYS', name: 'Rykestraße' });
    expect(legend[1].code).not.toBe('RYS');
    expect(legend[1].code).toMatch(/^[A-Z]{3}$/);
  });

  it('lists each distinct name once, preserving input order', () => {
    const legend = buildLegend(['Rykestraße', 'Rykestraße', 'Danziger Straße']);
    expect(legend.map((e) => e.name)).toEqual(['Rykestraße', 'Danziger Straße']);
  });
});
