import { useRouter } from "next/router";
import Navbar from "../../components/Navbar";
import WorksheetShop from "../../components/WorksheetShop";

export default function Worksheets() {
  const router = useRouter();
  const classFromQuery =
    typeof router.query.class === "string" ? router.query.class : "all";
  const typeFromQuery =
    typeof router.query.type === "string" ? router.query.type : "all";
  const subjectFromQuery =
    typeof router.query.subject === "string" ? router.query.subject : "all";
  const topicFromQuery =
    typeof router.query.topic === "string" ? router.query.topic : "all";
  const subtopicFromQuery =
    typeof router.query.subtopic === "string" ? router.query.subtopic : "all";
  const mobileViewFromQuery =
    typeof router.query.view === "string" ? router.query.view : "library";
  const openCartFromQuery =
    router.query.openCart === "1" || router.asPath.includes("openCart=1");

  return (
    <>
      <Navbar />
      <WorksheetShop
        key={`${classFromQuery}-${typeFromQuery}-${subjectFromQuery}-${topicFromQuery}-${subtopicFromQuery}-${mobileViewFromQuery}-${openCartFromQuery ? "cart" : "list"}`}
        initialClass={classFromQuery}
        initialType={typeFromQuery}
        initialSubject={subjectFromQuery}
        initialTopic={topicFromQuery}
        initialSubtopic={subtopicFromQuery}
        initialOpenCart={openCartFromQuery}
        initialMobileView={mobileViewFromQuery}
      />
    </>
  );
}
