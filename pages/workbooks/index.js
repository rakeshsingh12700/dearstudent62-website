import { useRouter } from "next/router";
import Navbar from "../../components/Navbar";
import WorkbookShop from "../../components/WorkbookShop";

export default function Workbooks() {
  const router = useRouter();
  const classFromQuery =
    typeof router.query.class === "string" ? router.query.class : "all";
  const typeFromQuery =
    typeof router.query.type === "string" ? router.query.type : "all";
  const openCartFromQuery = router.query.openCart === "1";

  return (
    <>
      <Navbar />
      <WorkbookShop
        key={`${classFromQuery}-${typeFromQuery}-${openCartFromQuery ? "cart" : "list"}`}
        initialClass={classFromQuery}
        initialType={typeFromQuery}
        initialOpenCart={openCartFromQuery}
      />
    </>
  );
}
