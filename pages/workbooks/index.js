import Link from "next/link";
import Navbar from "../../components/Navbar";

export default function Workbooks() {
  const classes = ["pre-nursery", "nursery", "lkg", "ukg"];

  return (
    <>
      <Navbar />
      <h1>Select Class</h1>
      <ul>
        {classes.map(c => (
          <li key={c}>
            <Link href={`/workbooks/${c}`}>{c.toUpperCase()}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}