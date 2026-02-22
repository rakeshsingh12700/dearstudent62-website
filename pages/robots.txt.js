const SITE_URL = "https://dearstudent.in";

export async function getServerSideProps({ res }) {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  res.setHeader("Content-Type", "text/plain");
  res.write(body);
  res.end();

  return {
    props: {},
  };
}

export default function RobotsTxt() {
  return null;
}
