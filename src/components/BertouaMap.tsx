import React, { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface BertouaMapProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  lang: "fr" | "en";
}

// Custom pin icons built from inline SVG so we never depend on Leaflet's default marker image
// paths, which routinely 404 under Vite/webpack bundlers unless manually re-pointed.
function pinIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.7 23.3 0 15 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
      <circle cx="15" cy="15" r="5.5" fill="white"/>
    </svg>`,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -38],
  });
}

const providerPin = pinIcon("#92400e"); // amber-800
const landmarkPin = pinIcon("#059669"); // emerald-600

const LANDMARKS = [
  { name: "Marché Mokolo", lat: 4.5798, lng: 13.6804 },
  { name: "Gare de Tigaza", lat: 4.5751, lng: 13.686 },
  { name: "Carrefour Kano", lat: 4.5772, lng: 13.6862 },
  { name: "Champs de Ndouan", lat: 4.574, lng: 13.679 },
];

function ClickToMove({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function BertouaMap({ lat, lng, onChange, lang }: BertouaMapProps) {
  const center = useMemo<[number, number]>(() => [lat, lng], [lat, lng]);

  return (
    <div className="w-full h-64 sm:h-72 rounded-2xl overflow-hidden border border-amber-200 shadow-inner relative z-0">
      <MapContainer center={center} zoom={15} scrollWheelZoom={false} className="w-full h-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickToMove onChange={onChange} />

        {LANDMARKS.map((lm) => (
          <Marker key={lm.name} position={[lm.lat, lm.lng]} icon={landmarkPin}>
            <Popup>{lm.name}</Popup>
          </Marker>
        ))}

        <Marker
          position={[lat, lng]}
          icon={providerPin}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target;
              const pos = marker.getLatLng();
              onChange(pos.lat, pos.lng);
            },
          }}
        >
          <Popup>{lang === "fr" ? "Votre emplacement" : "Your location"}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
