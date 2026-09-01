export default function Form() {
  return (
    <form className="expense-form">
      <h2 className="form-title">记一笔费用</h2>
      <label className="field">
        <span className="field-label">金额</span>
        <input className="field-input" type="number" placeholder="0.00" />
      </label>
      <label className="field">
        <span className="field-label">备注</span>
        <input className="field-input" type="text" placeholder="加油 / 停车 / 保养…" />
      </label>
      <button className="btn btn-primary" type="submit">
        记录费用
      </button>
    </form>
  );
}
