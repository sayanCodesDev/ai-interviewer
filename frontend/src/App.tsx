import "./index.css";

export function App() {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-medium">AI interviewer</h1>
      <input className=" min-w-sm border-1 border-black/10 rounded-md p-2 font-light " type="url" placeholder ="Your Github URL"/>
      <input className=" min-w-sm border-1 border-black/10 rounded-md p-2 font-light " type="url" placeholder ="Your LinkedIn URL" />
      <button className="bg-black/10 border-1 border-black/10 rounded-lg px-2 py-0.5 cursor-pointer shadow-sm">Start</button>
    </div>
  );
}

export default App;
