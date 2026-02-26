import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter } from './card';
import { Button } from './button';
import { Badge } from './badge';

const meta: Meta = {
  title: 'UI/Card',
  tags: ['autodocs'],
};

export default meta;

export const Default: StoryObj = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This is the card content area. Place any content here.
        </p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Action</Button>
      </CardFooter>
    </Card>
  ),
};

export const WithAction: StoryObj = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Card With Action</CardTitle>
        <CardDescription>Header action placed in top-right corner.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-xs">
            &hellip;
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Content goes here.</p>
      </CardContent>
    </Card>
  ),
};

export const Minimal: StoryObj = {
  render: () => (
    <Card className="w-80">
      <CardContent>
        <p className="text-sm">A minimal card with only content, no header or footer.</p>
      </CardContent>
    </Card>
  ),
};

export const WithBadge: StoryObj = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Project Analytics</CardTitle>
        <CardAction>
          <Badge variant="secondary">Active</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          14,523 events tracked this week.
        </p>
      </CardContent>
      <CardFooter className="justify-between">
        <span className="text-xs text-muted-foreground">Last updated 2h ago</span>
        <Button variant="outline" size="xs">View</Button>
      </CardFooter>
    </Card>
  ),
};

export const Grid: StoryObj = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 w-[640px]">
      {['Dashboard A', 'Dashboard B', 'Dashboard C', 'Dashboard D'].map((name) => (
        <Card key={name}>
          <CardHeader>
            <CardTitle>{name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">3 widgets</p>
          </CardContent>
        </Card>
      ))}
    </div>
  ),
};
