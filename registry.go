package main

import (
	"fmt"
	"log/slog"
	"sync"

	"github.com/google/uuid"
	"github.com/pion/webrtc/v4"
)

// keep track of which channels are being used
// only permit one publisher per channel
type Registry struct {
	sync.Mutex
	channels map[string]*Channel
}

type Channel struct {
	Publishers  map[string]*Publisher
	Subscribers map[string]*Subscriber
}

type Publisher struct {
	ID         string
	LocalTrack *webrtc.TrackLocalStaticRTP
}
type Subscriber struct {
	ID       string
	QuitChan chan struct{}
}

func NewRegistry() *Registry {
	r := &Registry{}
	r.channels = make(map[string]*Channel)
	return r
}

func (r *Registry) AddPublisher(channelName string, localTrack *webrtc.TrackLocalStaticRTP) error {
	r.Lock()
	defer r.Unlock()
	var channel *Channel
	var ok bool
	p := Publisher{
		ID:         uuid.NewString(),
		LocalTrack: localTrack,
	}
	
	if channel, ok = r.channels[channelName]; ok {
		// Channel exists, add publisher to the map
		channel.Publishers[p.ID] = &p
	} else {
		// Create new channel with the publisher
		channel = &Channel{
			Publishers:  map[string]*Publisher{p.ID: &p},
			Subscribers: make(map[string]*Subscriber),
		}
		r.channels[channelName] = channel
	}
	slog.Info("publisher added", "channel", channelName, "publisher_id", p.ID, "publisher_count", len(channel.Publishers))
	return nil
}

func (r *Registry) NewSubscriber() *Subscriber {
	s := &Subscriber{}
	s.QuitChan = make(chan struct{})
	s.ID = uuid.NewString()
	return s
}

func (r *Registry) AddSubscriber(channelName string, s *Subscriber) error {
	r.Lock()
	defer r.Unlock()
	var channel *Channel
	var ok bool
	if channel, ok = r.channels[channelName]; ok && len(channel.Publishers) > 0 {
		channel.Subscribers[s.ID] = s
		slog.Info("subscriber added", "channel", channelName, "subscriber_count", len(channel.Subscribers))
	} else {
		return fmt.Errorf("channel %q not ready", channelName)
	}
	return nil
}

func (r *Registry) RemovePublisher(channelName string) {
	r.Lock()
	defer r.Unlock()
	if channel, ok := r.channels[channelName]; ok {
		// Remove all publishers
		channel.Publishers = make(map[string]*Publisher)
		// Tell all subscribers to quit
		for _, s := range channel.Subscribers {
			close(s.QuitChan)
		}
		slog.Info("all publishers removed", "channel", channelName)
	}
}

// RemoveSpecificPublisher removes a specific publisher from a channel
func (r *Registry) RemoveSpecificPublisher(channelName, publisherID string) {
	r.Lock()
	defer r.Unlock()
	if channel, ok := r.channels[channelName]; ok {
		// Check if the publisher exists
		if _, exists := channel.Publishers[publisherID]; exists {
			// Remove the specific publisher
			delete(channel.Publishers, publisherID)
			slog.Info("publisher removed", "channel", channelName, "publisher_id", publisherID, "remaining_publishers", len(channel.Publishers))
			
			// If no publishers left, tell all subscribers to quit
			if len(channel.Publishers) == 0 {
				for _, s := range channel.Subscribers {
					close(s.QuitChan)
				}
				slog.Info("all subscribers notified of channel closure", "channel", channelName)
			}
		}
	}
}

func (r *Registry) RemoveSubscriber(channelName string, id string) {
	r.Lock()
	defer r.Unlock()
	if channel, ok := r.channels[channelName]; ok {
		delete(channel.Subscribers, id)
		slog.Info("subscriber removed", "channel", channelName, "subscriber_count", len(channel.Subscribers))
	}
}

func (r *Registry) GetChannels() []string {
	r.Lock()
	defer r.Unlock()
	channels := make([]string, 0)
	for name, c := range r.channels {
		if len(c.Publishers) > 0 {
			channels = append(channels, name)
		}
	}
	return channels
}

func (r *Registry) GetChannel(channelName string) *Channel {
	r.Lock()
	defer r.Unlock()
	for name, c := range r.channels {
		if name == channelName && len(c.Publishers) > 0 {
			return c
		}
	}
	return nil
}
