import { Link, useMatch } from "react-router";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { romikuNavigation } from "../routes/navigation";

export const RomikuPrimaryNavigation = () => (
  <nav aria-label="主导航">
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {romikuNavigation.map((item) => (
            <RomikuNavigationLink key={item.path} {...item} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  </nav>
);

const RomikuNavigationLink = ({
  icon: Icon,
  label,
  path,
}: (typeof romikuNavigation)[number]) => {
  const match = useMatch({ path, end: true });

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match} tooltip={label}>
        <Link to={path}>
          <Icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
