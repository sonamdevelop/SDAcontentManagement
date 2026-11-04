<?php

namespace Webkul\Property\Mail;

use Illuminate\Mail\Mailable;

class CustomerActionMail extends Mailable
{
    public function __construct(public string $purpose, public string $actionUrl) {}

    public function build()
    {
        $key = $this->purpose === 'verify' ? 'verify' : 'reset';
        $title = trans('admin::app.customer-actions.'.$key.'-title');
        $intro = trans('admin::app.customer-actions.'.$key.'-intro');

        return $this->from(config('mail.from.address') ?: 'no-reply@example.test', config('mail.from.name') ?: 'SDA')->subject($title)->html('<h1>'.e($title).'</h1><p>'.e($intro).'</p><p><a href="'.e($this->actionUrl).'">'.e($title).'</a></p><p>'.e(trans('admin::app.customer-actions.mail-expiry')).'</p>');
    }
}
