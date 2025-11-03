"use client";

import { useState } from "react";
import { WrapView } from "@/app/components/WrapView";
import { UnwrapView } from "@/app/components/UnwrapView";
import { Card, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

export function WrapPage() {
  const [activeTab, setActiveTab] = useState<"wrap" | "unwrap">("wrap");

  return (
    <div className="space-y-6 flex flex-col items-center">
      <div className="w-full max-w-md">
        <Card className="frost-bg frost-border w-full">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="pb-0">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger
                  value="wrap"
                  className="retro-text data-[state=active]:bg-blue-800 data-[state=active]:text-white"
                >
                  WRAP
                </TabsTrigger>
                <TabsTrigger
                  value="unwrap"
                  className="retro-text data-[state=active]:bg-blue-800 data-[state=active]:text-white"
                >
                  UNWRAP
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <Separator className="my-2" />
          </Tabs>
        </Card>
      </div>

      {activeTab === "wrap" ? <WrapView /> : <UnwrapView />}
    </div>
  );
}