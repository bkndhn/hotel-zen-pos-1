
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Plus } from 'lucide-react';
import { useMostSoldItems } from '@/hooks/useMostSoldItems';

interface MostSoldItemsProps {
  onAddItem: (item: any) => void;
}

const MostSoldItems: React.FC<MostSoldItemsProps> = ({ onAddItem }) => {
  const { mostSoldItems, loading } = useMostSoldItems(8);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="w-4 h-4" />
            Most Sold Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-xs text-muted-foreground">
            Loading most sold items...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (mostSoldItems.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="w-4 h-4" />
            Most Sold Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-xs text-muted-foreground">
            No sales data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4" />
          Most Sold Items
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {mostSoldItems.map((item) => (
            <div
              key={item.id}
              className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate">{item.name}</h4>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAddItem({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    image_url: item.image_url
                  })}
                  className="h-6 w-6 p-0 ml-2 flex-shrink-0"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium">₹{item.price}</span>
                <Badge variant="secondary" className="text-xs">
                  Sold: {item.total_quantity}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default MostSoldItems;
