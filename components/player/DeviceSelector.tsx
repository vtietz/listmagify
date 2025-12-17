/**
 * DeviceSelector component - Popup for selecting Spotify playback device.
 * Similar to Spotify Connect device picker.
 */

'use client';

import { useEffect, useRef } from 'react';
import { 
  Smartphone, 
  Monitor, 
  Speaker, 
  Tv, 
  Car,
  Gamepad2,
  Radio,
  RefreshCw,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SpotifyDevice } from '@/lib/spotify/playerTypes';
import { cn } from '@/lib/utils';

interface DeviceSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  devices: SpotifyDevice[];
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  onRefresh: () => void;
}

function getDeviceIcon(type: SpotifyDevice['type']) {
  switch (type) {
    case 'Smartphone':
      return Smartphone;
    case 'Computer':
      return Monitor;
    case 'Speaker':
    case 'CastAudio':
      return Speaker;
    case 'TV':
    case 'CastVideo':
      return Tv;
    case 'Automobile':
      return Car;
    case 'GameConsole':
      return Gamepad2;
    case 'AVR':
    case 'STB':
    case 'AudioDongle':
      return Radio;
    default:
      return Speaker;
  }
}

export function DeviceSelector({
  isOpen,
  onClose,
  devices,
  selectedDeviceId,
  onSelectDevice,
  onRefresh,
}: DeviceSelectorProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    // Delay adding listener to avoid immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-24">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      
      {/* Panel */}
      <div
        ref={panelRef}
        className="relative bg-background border border-border rounded-lg shadow-xl w-[320px] max-h-[400px] overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Connect to a device</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRefresh}
            title="Refresh devices"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Device list */}
        <div className="overflow-auto max-h-[300px]">
          {devices.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <Speaker className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm mb-2">No devices found</p>
              <p className="text-xs">Open Spotify on a device to see it here</p>
            </div>
          ) : (
            <ul className="py-2">
              {devices.map((device) => {
                const Icon = getDeviceIcon(device.type);
                const isSelected = device.id === selectedDeviceId || device.isActive;
                
                return (
                  <li key={device.id}>
                    <button
                      onClick={() => onSelectDevice(device.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors',
                        isSelected && 'bg-accent/30'
                      )}
                    >
                      <div className={cn(
                        'p-2 rounded-full',
                        device.isActive ? 'bg-green-500/20 text-green-500' : 'bg-muted'
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-sm font-medium flex items-center gap-2">
                          {device.name}
                          {device.isActive && (
                            <span className="text-xs text-green-500">Playing</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {device.type}
                          {device.volumePercent !== null && ` • ${device.volumePercent}%`}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-green-500" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">
            Spotify Connect lets you play on other devices
          </p>
        </div>
      </div>
    </div>
  );
}
