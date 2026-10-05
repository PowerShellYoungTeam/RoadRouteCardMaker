import React, { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Popup, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const numberedIcon = (n, last) =>
    L.divIcon({
        className: 'wp-icon',
        html: `<div class="wp-pin ${n === 1 ? 'wp-start' : last ? 'wp-end' : ''}">${n}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });

function ClickHandler({ onAdd }) {
    useMapEvents({ click: e => onAdd({ lat: e.latlng.lat, lon: e.latlng.lng }) });
    return null;
}

function FitRoute({ geometry }) {
    const map = useMap();
    useEffect(() => {
        if (geometry && geometry.length > 1) map.fitBounds(geometry, { padding: [20, 20] });
    }, [geometry, map]);
    return null;
}

const restrictionColour = r => (r.conflict ? '#d00' : r.onRoute ? '#f80' : '#888');

// Leaflet caches its container size; tell it when the splitters change the map's size.
function AutoResize() {
    const map = useMap();
    useEffect(() => {
        const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
        ro.observe(map.getContainer());
        return () => ro.disconnect();
    }, [map]);
    return null;
}

export default function MapPanel({ waypoints, geometry, restrictions, onAddWaypoint, onMoveWaypoint, height }) {
    return (
        <div className="map-wrap" style={height ? { height } : undefined}>
        <MapContainer center={[51.2, -1.8]} zoom={8} className="map" scrollWheelZoom>
            <AutoResize />
            <TileLayer
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <ClickHandler onAdd={onAddWaypoint} />
            <FitRoute geometry={geometry} />
            {geometry && geometry.length > 1 && <Polyline positions={geometry} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.8 }} />}
            {restrictions.map(r => (
                <CircleMarker
                    key={r.id}
                    center={[r.lat, r.lon]}
                    radius={r.conflict ? 9 : 6}
                    pathOptions={{ color: restrictionColour(r), fillColor: restrictionColour(r), fillOpacity: 0.7 }}
                >
                    <Popup>
                        <strong>{r.conflict ? '⚠ CONFLICT: ' : ''}{r.description}</strong>
                        <br />
                        {r.onRoute ? 'On route' : 'Near route (may be a crossing road)'}
                        <br />
                        <code>{r.tag}={r.value}</code>
                        <br />
                        <a href={r.osmUrl} target="_blank" rel="noreferrer">View on OSM</a>
                    </Popup>
                </CircleMarker>
            ))}
            {waypoints.map((w, i) => (
                <Marker
                    key={`${i}-${w.lat}-${w.lon}`}
                    position={[w.lat, w.lon]}
                    icon={numberedIcon(i + 1, i === waypoints.length - 1 && waypoints.length > 1)}
                    draggable
                    eventHandlers={{ dragend: e => { const p = e.target.getLatLng(); onMoveWaypoint(i, { lat: p.lat, lon: p.lng }); } }}
                >
                    <Popup>{w.name || `Waypoint ${i + 1}`}</Popup>
                </Marker>
            ))}
        </MapContainer>
        </div>
    );
}
