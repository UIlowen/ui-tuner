export default function Navbar() {
  return (
    <header className="navbar">
      <span className="navbar-brand">车管工作台</span>
      <nav className="navbar-links">
        <a className="nav-link" href="#overview">
          总览
        </a>
        <a className="nav-link" href="#vehicles">
          车辆
        </a>
        <a className="nav-link" href="#expenses">
          费用
        </a>
      </nav>
      <span className="navbar-user">运营 · 刘</span>
    </header>
  );
}
