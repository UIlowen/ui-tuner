const VEHICLES = [
  { plate: "粤A·12345", note: "商务接待", status: "在用" },
  { plate: "粤A·67890", note: "日常通勤", status: "保养中" },
  { plate: "粤B·24680", note: "跨城差旅", status: "在用" },
];

export default function List() {
  return (
    <section className="vehicle-section">
      <h2 className="section-title">车队清单</h2>
      <ul className="vehicle-list">
        {VEHICLES.map((vehicle) => (
          <li className="vehicle-item" key={vehicle.plate}>
            <span className="vehicle-plate">{vehicle.plate}</span>
            <span className="vehicle-note">{vehicle.note}</span>
            <span className="vehicle-status">{vehicle.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
