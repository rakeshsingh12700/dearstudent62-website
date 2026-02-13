import { useRouter } from "next/router";
import Navbar from "../../components/Navbar";
import WorksheetShop from "../../components/WorksheetShop";

export default function Worksheets() {
  const router = useRouter();
  const classFromQuery =
    typeof router.query.class === "string" ? router.query.class : "all";
  const typeFromQuery =
    typeof router.query.type === "string" ? router.query.type : "all";
  const openCartFromQuery =
    router.query.openCart === "1" || router.asPath.includes("openCart=1");

  return (
    <>
      <Navbar />
      <WorksheetShop
        key={`${classFromQuery}-${typeFromQuery}-${openCartFromQuery ? "cart" : "list"}`}
        initialClass={classFromQuery}
        initialType={typeFromQuery}
        initialOpenCart={openCartFromQuery}
      />
    </>
  );
}
