import Navbar from "./components/Navbar";
import Card from "./components/Card";
import Form from "./components/Form";
import List from "./components/List";

export function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <Card />
        <Form />
        <List />
      </main>
    </div>
  );
}
