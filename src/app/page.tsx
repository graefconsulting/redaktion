import { prisma } from "@/lib/db";
import { getUpcomingWeeksOptions } from "@/lib/dateUtils";
import DashboardClient from "./DashboardClient";

export const dynamic = 'force-dynamic';

export default async function Home() {
  // Fetch all week plans
  const weekPlansData = await prisma.weekPlan.findMany({
    orderBy: [
      { year: 'desc' },
      { week: 'desc' }
    ],
    include: {
      postSlots: true
    }
  });

  const mappedPlans = weekPlansData.map(plan => ({
    id: plan.id,
    year: plan.year,
    week: plan.week,
    status: plan.status,
    postCount: plan.postSlots.length
  }));

  // Fetch all finalized posts
  const finalizedPostsData = await prisma.postSlot.findMany({
    where: {
      weekPlan: {
        status: "finalized"
      }
    },
    include: {
      images: {
        orderBy: { createdAt: 'desc' }, // Just in case, taking latest image
        take: 1
      },
      weekPlan: true
    },
    orderBy: [
      { weekPlan: { year: 'desc' } },
      { weekPlan: { week: 'desc' } }
    ]
  });

  const finalizedPosts = finalizedPostsData.map(post => ({
    id: post.id,
    weekPlanId: post.weekPlan.id,
    weekPlanYear: post.weekPlan.year,
    weekPlanWeek: post.weekPlan.week,
    category: post.category,
    content: post.selectedContent || "",
    imageUrl: post.images.length > 0 ? post.images[0].url : null,
    createdAt: post.createdAt
  }));

  const upcomingOptions = getUpcomingWeeksOptions(12);

  return (
    <DashboardClient
      initialWeekPlans={mappedPlans}
      finalizedPosts={finalizedPosts}
      upcomingWeeksOptions={upcomingOptions}
    />
  );
}
