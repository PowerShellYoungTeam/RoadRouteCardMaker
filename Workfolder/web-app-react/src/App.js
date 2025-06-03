import React, { useState } from 'react';
import './App.css';

function App() {
    const [form, setForm] = useState({
        driver: '',
        truck: '',
        route: '',
        stops: '',
        date: ''
    });
    const [legs, setLegs] = useState([
        { from: '', to: '', distance: '', direction: '', description: '' }
    ]);

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleLegChange = (idx, e) => {
        const newLegs = legs.map((leg, lidx) =>
            lidx === idx ? { ...leg, [e.target.name]: e.target.value } : leg
        );
        setLegs(newLegs);
    };

    const addLeg = () => {
        setLegs([...legs, { from: '', to: '', distance: '', direction: '', description: '' }]);
    };

    const removeLeg = (idx) => {
        setLegs(legs.filter((_, lidx) => lidx !== idx));
    };

    return (
        <div className="App">
            <h1>Truck Route Card Generator</h1>
            <form className="route-form">
                <label>Driver Name:<input name="driver" value={form.driver} onChange={handleChange} /></label><br />
                <label>Truck Number:<input name="truck" value={form.truck} onChange={handleChange} /></label><br />
                <label>Route Description:<input name="route" value={form.route} onChange={handleChange} /></label><br />
                <label>Stops (comma separated):<input name="stops" value={form.stops} onChange={handleChange} /></label><br />
                <label>Date:<input name="date" type="date" value={form.date} onChange={handleChange} /></label><br />
            </form>
            <div className="route-legs-section">
                <h2>Route Legs</h2>
                <table className="route-legs-table">
                    <thead>
                        <tr>
                            <th>Serial</th>
                            <th>From (OS Grid)</th>
                            <th>To (OS Grid)</th>
                            <th>Distance</th>
                            <th>Direction</th>
                            <th>Description</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {legs.map((leg, idx) => (
                            <tr key={idx}>
                                <td>{idx + 1}</td>
                                <td><input name="from" value={leg.from} onChange={e => handleLegChange(idx, e)} /></td>
                                <td><input name="to" value={leg.to} onChange={e => handleLegChange(idx, e)} /></td>
                                <td><input name="distance" value={leg.distance} onChange={e => handleLegChange(idx, e)} /></td>
                                <td><input name="direction" value={leg.direction} onChange={e => handleLegChange(idx, e)} /></td>
                                <td><input name="description" value={leg.description} onChange={e => handleLegChange(idx, e)} /></td>
                                <td>{legs.length > 1 && <button type="button" onClick={() => removeLeg(idx)}>-</button>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <button type="button" onClick={addLeg}>Add Leg</button>
            </div>
            <div className="route-card-preview">
                <h2>Route Card Preview</h2>
                <div className="route-card">
                    <p><strong>Driver:</strong> {form.driver}</p>
                    <p><strong>Truck:</strong> {form.truck}</p>
                    <p><strong>Route:</strong> {form.route}</p>
                    <p><strong>Stops:</strong> {form.stops}</p>
                    <p><strong>Date:</strong> {form.date}</p>
                    <table className="route-legs-table">
                        <thead>
                            <tr>
                                <th>Serial</th>
                                <th>From</th>
                                <th>To</th>
                                <th>Distance</th>
                                <th>Direction</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            {legs.map((leg, idx) => (
                                <tr key={idx}>
                                    <td>{idx + 1}</td>
                                    <td>{leg.from}</td>
                                    <td>{leg.to}</td>
                                    <td>{leg.distance}</td>
                                    <td>{leg.direction}</td>
                                    <td>{leg.description}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export default App;
