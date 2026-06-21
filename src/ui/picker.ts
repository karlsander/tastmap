import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import type { BBox, LngLat } from '../core';

// Vite bundles Leaflet's marker images as URLs; wire them up so the pin renders.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export interface Picker {
  getCenter(): LngLat;
  /** Move the marker without firing the change callback. */
  setCenter(c: LngLat): void;
  /** Draw/update the page footprint rectangle. */
  setFootprint(bbox: BBox): void;
  onCenterChange(cb: (c: LngLat) => void): void;
}

export function createPicker(el: HTMLElement, initial: LngLat): Picker {
  const map = L.map(el).setView([initial.lat, initial.lng], 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  }).addTo(map);

  const marker = L.marker([initial.lat, initial.lng], { draggable: true, keyboard: true }).addTo(map);
  let rect: L.Rectangle | null = null;
  let changeCb: ((c: LngLat) => void) | null = null;

  const emit = (): void => {
    const ll = marker.getLatLng();
    changeCb?.({ lat: ll.lat, lng: ll.lng });
  };

  marker.on('dragend', emit);
  map.on('click', (e: L.LeafletMouseEvent) => {
    marker.setLatLng(e.latlng);
    emit();
  });

  return {
    getCenter() {
      const ll = marker.getLatLng();
      return { lat: ll.lat, lng: ll.lng };
    },
    setCenter(c) {
      marker.setLatLng([c.lat, c.lng]);
      map.setView([c.lat, c.lng]); // pan the view too (e.g. after an address search)
    },
    setFootprint(bbox) {
      const bounds: L.LatLngBoundsExpression = [
        [bbox.minLat, bbox.minLng],
        [bbox.maxLat, bbox.maxLng],
      ];
      if (rect) {
        rect.setBounds(bounds);
      } else {
        rect = L.rectangle(bounds, { color: '#c00', weight: 2, fill: false, interactive: false }).addTo(map);
      }
    },
    onCenterChange(cb) {
      changeCb = cb;
    },
  };
}
