import { useRouter } from "next/router";
import Navbar from "../../components/Navbar";
import WorkbookShop from "../../components/WorkbookShop";

export default function ClassPage() {
  const { query } = useRouter();
  const classFromRoute =
    typeof query.class === "string" ? query.class.toLowerCase() : "all";
  const typeFromQuery =
    typeof query.type === "string" ? query.type.toLowerCase() : "all";
  const openCartFromQuery = query.openCart === "1";

  return (
    <>
      <Navbar />
      <WorkbookShop
        key={`${classFromRoute}-${typeFromQuery}-${openCartFromQuery ? "cart" : "list"}`}
        initialClass={classFromRoute}
        initialType={typeFromQuery}
        initialOpenCart={openCartFromQuery}
      />
    </>
  );
}
