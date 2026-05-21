// Client-only Leaflet map (lazy-loaded to avoid SSR window issues).
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

interface Cafe { cafeteria_id: string; name: string; lat: number; lng: number; distance_km: number }

function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.setView([lat, lng], map.getZoom() || 13); }, [lat, lng, map]);
  return null;
}

interface Props {
  center: [number, number];
  radiusKm: number;
  cafes: Cafe[];
  youAreHereLabel: string;
}

export default function NearbyMap({ center, radiusKm, cafes, youAreHereLabel }: Props) {
  return (
    <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
      <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FlyTo lat={center[0]} lng={center[1]} />
      <Marker position={center}><Popup>{youAreHereLabel}</Popup></Marker>
      <Circle center={center} radius={radiusKm * 1000} pathOptions={{ color: "#3b82f6", fillOpacity: 0.05 }} />
      {cafes.map((c) => (
        <Marker key={c.cafeteria_id} position={[c.lat, c.lng]}>
          <Popup>
            <div className="font-semibold">{c.name}</div>
            <div className="text-xs">{c.distance_km.toFixed(1)} km</div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
