import Button from "./Button";

export default function Card() {
  return (
    <section className="card stat-card">
      <h2 className="card-title">本月费用概览</h2>
      <p className="stat-value">¥ 12,480</p>
      <p className="stat-hint">较上月 +8.2%</p>
      <div className="card-actions">
        <Button>查看详情</Button>
        <Button variant="ghost">导出报表</Button>
      </div>
    </section>
  );
}
