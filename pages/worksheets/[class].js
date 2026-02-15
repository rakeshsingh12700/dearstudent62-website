import { useRouter } from "next/router";
import Navbar from "../../components/Navbar";
import WorksheetShop from "../../components/WorksheetShop";

export default function ClassPage() {
  const router = useRouter();
  const { query } = router;
  const classFromRoute =
    typeof query.class === "string" ? query.class.toLowerCase() : "all";
  const typeFromQuery =
    typeof query.type === "string" ? query.type.toLowerCase() : "all";
  const subjectFromQuery =
    typeof query.subject === "string" ? query.subject.toLowerCase() : "all";
  const topicFromQuery =
    typeof query.topic === "string" ? query.topic.toLowerCase() : "all";
  const subtopicFromQuery =
    typeof query.subtopic === "string" ? query.subtopic.toLowerCase() : "all";
  const sortFromQuery =
    typeof query.sort === "string" ? query.sort.toLowerCase() : "default";
  const mobileViewFromQuery =
    typeof query.view === "string" ? query.view.toLowerCase() : "class";
  const openCartFromQuery =
    query.openCart === "1" || router.asPath.includes("openCart=1");

  return (
    <>
      <Navbar />
      <WorksheetShop
        key={`${classFromRoute}-${typeFromQuery}-${subjectFromQuery}-${topicFromQuery}-${subtopicFromQuery}-${sortFromQuery}-${mobileViewFromQuery}-${openCartFromQuery ? "cart" : "list"}`}
        initialClass={classFromRoute}
        initialType={typeFromQuery}
        initialSubject={subjectFromQuery}
        initialTopic={topicFromQuery}
        initialSubtopic={subtopicFromQuery}
        initialSort={sortFromQuery}
        initialOpenCart={openCartFromQuery}
        initialMobileView={mobileViewFromQuery}
      />
    </>
  );
}
